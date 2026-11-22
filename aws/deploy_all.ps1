# ══════════════════════════════════════════════════════════════════════
# HealthNet — Script Unificado de Despliegue en AWS (PowerShell / Windows)
# ══════════════════════════════════════════════════════════════════════
param(
    [string]$Region = "us-west-1",
    [string]$StackName = "healthnet-production-stack",
    [string]$Environment = "prod"
)

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Iniciando Despliegue Automatizado de Infraestructura HealthNet" -ForegroundColor Cyan
Write-Host "Región: $Region | Stack: $StackName | Entorno: $Environment" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════"

# 1. Verificar AWS CLI
try {
    $identity = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Host "[OK] Autenticado en AWS como: $($identity.Arn)" -ForegroundColor Green
} catch {
    Write-Error "Error: AWS CLI no está configurado o las credenciales no son válidas. Ejecuta 'aws configure'."
    exit 1
}

# 2. Desplegar / Actualizar CloudFormation Stack
Write-Host "`n[Paso 1/4] Desplegando CloudFormation Stack (VPC, RDS, Cognito, API Gateway, IAM)..." -ForegroundColor Yellow
aws cloudformation deploy `
    --template-file aws/cloudformation_healthnet_stack.yaml `
    --stack-name $StackName `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region `
    --parameter-overrides Environment=$Environment

if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo en el despliegue del stack de CloudFormation."
    exit 1
}

# 3. Obtener Outputs de CloudFormation
Write-Host "`n[Paso 2/4] Consultando endpoints y configuraciones generadas..." -ForegroundColor Yellow
$outputs = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

$apiEndpoint = ($outputs | Where-Object { $_.OutputKey -eq "ApiEndpoint" }).OutputValue
$userPoolId = ($outputs | Where-Object { $_.OutputKey -eq "CognitoUserPoolId" }).OutputValue
$appClientId = ($outputs | Where-Object { $_.OutputKey -eq "CognitoAppClientId" }).OutputValue
$identityPoolId = ($outputs | Where-Object { $_.OutputKey -eq "CognitoIdentityPoolId" }).OutputValue
$dbHost = ($outputs | Where-Object { $_.OutputKey -eq "DatabaseEndpoint" }).OutputValue

Write-Host "  API Endpoint:        $apiEndpoint" -ForegroundColor Green
Write-Host "  Cognito User Pool:   $userPoolId" -ForegroundColor Green
Write-Host "  Cognito App Client:  $appClientId" -ForegroundColor Green
Write-Host "  Identity Pool:       $identityPoolId" -ForegroundColor Green
Write-Host "  RDS DB Endpoint:     $dbHost" -ForegroundColor Green

# 4. Empaquetar y Actualizar Función Lambda
Write-Host "`n[Paso 3/4] Empaquetando y desplegando código de Lambda healthnet-patients-api..." -ForegroundColor Yellow
$lambdaDir = "aws/lambdas/patients-api"
$zipPath = "aws/lambda_patients_api.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$lambdaDir/*" -DestinationPath $zipPath -Force

$lambdaFunctionName = "healthnet-patients-api-$Environment"
aws lambda update-function-code `
    --function-name $lambdaFunctionName `
    --zip-file "fileb://$zipPath" `
    --region $Region

# 5. Generar archivo .env para el Frontend
Write-Host "`n[Paso 4/4] Sincronizando variables en archivo .env..." -ForegroundColor Yellow
$envContent = @"
# ══════════════════════════════════════════════════════════════════════
# HEALTH NET — Configuración AWS de Producción (Generada Automáticamente)
# ══════════════════════════════════════════════════════════════════════
VITE_AWS_REGION=$Region
VITE_COGNITO_USER_POOL_ID=$userPoolId
VITE_COGNITO_CLIENT_ID=$appClientId
VITE_COGNITO_IDENTITY_POOL_ID=$identityPoolId
VITE_API_ENDPOINT=$apiEndpoint
"@

Set-Content -Path ".env" -Value $envContent -Force

Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Despliegue y configuración completados con éxito." -ForegroundColor Green
Write-Host "Para inicializar la base de datos ejecuta:" -ForegroundColor Yellow
Write-Host "psql -h $dbHost -U healthnet_admin -d healthnet_db -f aws/healthnet_database_schema_master.sql" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════"
