#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# HEALTH NET — Configuración de Endpoints /users en API Gateway (us-west-1)
# Este script crea los recursos necesarios para gestión de usuarios en
# API Gateway y los conecta a la función Lambda healthnet-patients-api.
# ──────────────────────────────────────────────────────────────────────

set -e

REGION="us-west-1"
ACCOUNT_ID="743337585043"
API_ID="hv0xc9paj2"
LAMBDA_NAME="healthnet-patients-api"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"

echo "=============================================================="
echo "Configurando endpoints de /users en API Gateway ${API_ID}..."
echo "=============================================================="

# 1. Obtener ID del recurso Raíz (/)
ROOT_ID=$(aws apigateway get-resources --rest-api-id ${API_ID} --region ${REGION} --query 'items[?path==`/`].id' --output text)
echo "Recurso Raíz ID: ${ROOT_ID}"

# 2. Crear recurso '/users'
USERS_ID=$(aws apigateway create-resource --rest-api-id ${API_ID} --parent-id ${ROOT_ID} --path-part "users" --region ${REGION} --query 'id' --output text)
echo "Recurso /users ID: ${USERS_ID}"

# Método ANY en '/users' con proxy Lambda
aws apigateway put-method --rest-api-id ${API_ID} --resource-id ${USERS_ID} --http-method ANY --authorization-type "NONE" --region ${REGION}
aws apigateway put-integration --rest-api-id ${API_ID} --resource-id ${USERS_ID} --http-method ANY --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" --region ${REGION}

# 3. Crear recurso '/users/{id}'
USER_ID_RES=$(aws apigateway create-resource --rest-api-id ${API_ID} --parent-id ${USERS_ID} --path-part "{id}" --region ${REGION} --query 'id' --output text)
echo "Recurso /users/{id} ID: ${USER_ID_RES}"

# 4. Crear recurso '/users/{id}/status'
STATUS_ID=$(aws apigateway create-resource --rest-api-id ${API_ID} --parent-id ${USER_ID_RES} --path-part "status" --region ${REGION} --query 'id' --output text)
echo "Recurso /users/{id}/status ID: ${STATUS_ID}"

aws apigateway put-method --rest-api-id ${API_ID} --resource-id ${STATUS_ID} --http-method ANY --authorization-type "NONE" --region ${REGION}
aws apigateway put-integration --rest-api-id ${API_ID} --resource-id ${STATUS_ID} --http-method ANY --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" --region ${REGION}

# 5. Crear recurso '/users/{id}/reset-password'
RESET_ID=$(aws apigateway create-resource --rest-api-id ${API_ID} --parent-id ${USER_ID_RES} --path-part "reset-password" --region ${REGION} --query 'id' --output text)
echo "Recurso /users/{id}/reset-password ID: ${RESET_ID}"

aws apigateway put-method --rest-api-id ${API_ID} --resource-id ${RESET_ID} --http-method ANY --authorization-type "NONE" --region ${REGION}
aws apigateway put-integration --rest-api-id ${API_ID} --resource-id ${RESET_ID} --http-method ANY --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" --region ${REGION}

# 6. Desplegar en el stage 'prod'
aws apigateway create-deployment --rest-api-id ${API_ID} --stage-name prod --region ${REGION}

echo "=============================================================="
echo "¡Rutas /users desplegadas con éxito en API Gateway prod!"
echo "Invoke URL: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod/users"
echo "=============================================================="
