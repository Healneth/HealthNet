#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# HealthNet — Script Unificado de Despliegue en AWS (Bash / Linux / Mac)
# ══════════════════════════════════════════════════════════════════════
set -e

REGION="${1:-us-west-1}"
STACK_NAME="${2:-healthnet-production-stack}"
ENVIRONMENT="${3:-prod}"

echo "════════════════════════════════════════════════════════════════"
echo "Iniciando Despliegue Automatizado de Infraestructura HealthNet"
echo "Región: $REGION | Stack: $STACK_NAME | Entorno: $ENVIRONMENT"
echo "════════════════════════════════════════════════════════════════"

# 1. Verificar AWS CLI
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "Error: Credenciales de AWS no configuradas. Ejecuta 'aws configure'."
    exit 1
fi
echo "[OK] Autenticado en AWS exitosamente."

# 2. Desplegar Stack CloudFormation
echo ""
echo "[Paso 1/4] Desplegando CloudFormation Stack (VPC, RDS, Cognito, API Gateway, IAM)..."
aws cloudformation deploy \
    --template-file aws/cloudformation_healthnet_stack.yaml \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --parameter-overrides Environment="$ENVIRONMENT"

# 3. Obtener Outputs
echo ""
echo "[Paso 2/4] Consultando endpoints y configuraciones generadas..."
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text)
APP_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CognitoAppClientId'].OutputValue" --output text)
IDENTITY_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='CognitoIdentityPoolId'].OutputValue" --output text)
DB_HOST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text)

echo "  API Endpoint:        $API_ENDPOINT"
echo "  Cognito User Pool:   $USER_POOL_ID"
echo "  Cognito App Client:  $APP_CLIENT_ID"
echo "  Identity Pool:       $IDENTITY_POOL_ID"
echo "  RDS DB Endpoint:     $DB_HOST"

# 4. Empaquetar y Actualizar Lambda
echo ""
echo "[Paso 3/4] Empaquetando y desplegando código de Lambda..."
ZIP_FILE="aws/lambda_patients_api.zip"
rm -f "$ZIP_FILE"
(cd aws/lambdas/patients-api && zip -rq "../../../$ZIP_FILE" .)

aws lambda update-function-code \
    --function-name "healthnet-patients-api-$ENVIRONMENT" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$REGION"

# 5. Generar archivo .env
echo ""
echo "[Paso 4/4] Sincronizando variables en archivo .env..."
cat <<EOF > .env
# ══════════════════════════════════════════════════════════════════════
# HEALTH NET — Configuración AWS de Producción (Generada Automáticamente)
# ══════════════════════════════════════════════════════════════════════
VITE_AWS_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$APP_CLIENT_ID
VITE_COGNITO_IDENTITY_POOL_ID=$IDENTITY_POOL_ID
VITE_API_ENDPOINT=$API_ENDPOINT
EOF

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Despliegue y configuración completados con éxito."
echo "Para inicializar la base de datos ejecuta:"
echo "psql -h $DB_HOST -U healthnet_admin -d healthnet_db -f aws/healthnet_database_schema_master.sql"
echo "════════════════════════════════════════════════════════════════"
