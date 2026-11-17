#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# HEALTH NET — Actualización del Código de la Función Lambda en AWS
# Sube function_deploy.zip a la función healthnet-patients-api en us-west-1
# ──────────────────────────────────────────────────────────────────────

set -e

REGION="us-west-1"
LAMBDA_NAME="healthnet-patients-api"
ZIP_PATH="aws/lambdas/patients-api/function_deploy.zip"

if [ ! -f "${ZIP_PATH}" ]; then
  echo "Error: No se encontró el archivo ${ZIP_PATH}"
  exit 1
fi

echo "Subiendo paquete ${ZIP_PATH} a AWS Lambda (${LAMBDA_NAME} en ${REGION})..."

aws lambda update-function-code \
  --function-name "${LAMBDA_NAME}" \
  --zip-file "fileb://${ZIP_PATH}" \
  --region "${REGION}"

echo "=============================================================="
echo "¡Función Lambda actualizada exitosamente en AWS!"
echo "=============================================================="
