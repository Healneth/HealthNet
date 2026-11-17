#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# HEALTH NET — Configuración Completa de API Gateway en us-west-1
# Este script crea o actualiza los recursos en la API REST de HealthNet:
# - /patients y /patients/{deviceId}
# - /patients/{deviceId}/archive y /patients/{deviceId}/unarchive
# - /users, /users/{id}/status, /users/{id}/reset-password
# - /audit-logs
# Configura la integración proxy con Lambda y despliega en 'prod'.
# ──────────────────────────────────────────────────────────────────────

set -e

REGION="us-west-1"
ACCOUNT_ID="743337585043"
LAMBDA_NAME="healthnet-patients-api"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"
API_ID="${1:-hv0xc9paj2}"

echo "=============================================================="
echo "Configurando API Gateway ${API_ID} en ${REGION}..."
echo "=============================================================="

# 1. Obtener ID del recurso Raíz (/)
ROOT_ID=$(aws apigateway get-resources --rest-api-id ${API_ID} --region ${REGION} --query 'items[?path==`/`].id' --output text)
echo "Recurso Raíz ID: ${ROOT_ID}"

# Función auxiliar para crear recurso con método ANY proxy si no existe
setup_proxy_resource() {
    local parent_id=$1
    local path_part=$2
    local full_path=$3

    local res_id=$(aws apigateway get-resources --rest-api-id ${API_ID} --region ${REGION} --query "items[?path==\`${full_path}\`].id" --output text)
    if [ -z "${res_id}" ] || [ "${res_id}" == "None" ]; then
        echo "Creando recurso ${full_path}..."
        res_id=$(aws apigateway create-resource --rest-api-id ${API_ID} --parent-id ${parent_id} --path-part "${path_part}" --region ${REGION} --query 'id' --output text)
    fi

    echo "Configurando integración Lambda ANY en ${full_path} (ID: ${res_id})..."
    aws apigateway put-method --rest-api-id ${API_ID} --resource-id ${res_id} --http-method ANY --authorization-type "NONE" --region ${REGION} 2>/dev/null || true
    aws apigateway put-integration --rest-api-id ${API_ID} --resource-id ${res_id} --http-method ANY --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" --region ${REGION}
    
    echo "${res_id}"
}

# 2. Recurso /patients
PATIENTS_ID=$(setup_proxy_resource ${ROOT_ID} "patients" "/patients")

# 3. Recurso /patients/{deviceId}
DEVICE_ID=$(setup_proxy_resource ${PATIENTS_ID} "{deviceId}" "/patients/{deviceId}")

# 4. Recurso /patients/{deviceId}/archive
ARCHIVE_ID=$(setup_proxy_resource ${DEVICE_ID} "archive" "/patients/{deviceId}/archive")

# 5. Recurso /patients/{deviceId}/unarchive
UNARCHIVE_ID=$(setup_proxy_resource ${DEVICE_ID} "unarchive" "/patients/{deviceId}/unarchive")

# 6. Recurso /users
USERS_ID=$(setup_proxy_resource ${ROOT_ID} "users" "/users")

# 7. Recurso /users/{id}
USER_ITEM_ID=$(setup_proxy_resource ${USERS_ID} "{id}" "/users/{id}")

# 8. Recurso /users/{id}/status
USER_STATUS_ID=$(setup_proxy_resource ${USER_ITEM_ID} "status" "/users/{id}/status")

# 9. Recurso /users/{id}/reset-password
USER_RESET_ID=$(setup_proxy_resource ${USER_ITEM_ID} "reset-password" "/users/{id}/reset-password")

# 10. Recurso /audit-logs
AUDIT_ID=$(setup_proxy_resource ${ROOT_ID} "audit-logs" "/audit-logs")

# 11. Otorgar permisos a API Gateway para invocar la función Lambda
echo "Actualizando permisos de invocación para la función Lambda..."
aws lambda add-permission --function-name ${LAMBDA_NAME} --statement-id apigateway-invoke-permission-all --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/*" 2>/dev/null || true

# 12. Desplegar en el stage 'prod'
echo "Desplegando cambios en el stage 'prod'..."
aws apigateway create-deployment --rest-api-id ${API_ID} --stage-name prod --region ${REGION}

echo "=============================================================="
echo "¡API REST configurada y desplegada con éxito!"
echo "Invoke URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo "=============================================================="
