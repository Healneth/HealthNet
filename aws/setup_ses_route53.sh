#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# HEALTH NET — Configuración de Amazon SES, DKIM y DNS en Route 53
# Región: us-west-1 | Dominio: healthnet.click
# ──────────────────────────────────────────────────────────────────────

set -e

REGION="us-west-1"
DOMAIN="healthnet.click"

echo "=============================================================="
echo "Configuración de Amazon SES y Route 53 para ${DOMAIN}"
echo "=============================================================="

# 1. Obtener ID de la zona hospedada en Route 53 para healthnet.click
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "${DOMAIN}." --query 'HostedZones[0].Id' --output text | sed 's/\/hostedzone\///')
echo "Route 53 Hosted Zone ID para ${DOMAIN}: ${ZONE_ID}"

# 2. Registrar la identidad de dominio en SES v2
echo "Creando identidad de correo en Amazon SES v2..."
aws sesv2 create-email-identity --email-identity "${DOMAIN}" --region "${REGION}" || true

# 3. Obtener tokens DKIM generados por SES
echo "Consultando configuración DKIM..."
DKIM_TOKENS=$(aws sesv2 get-email-identity --email-identity "${DOMAIN}" --region "${REGION}" --query 'DkimAttributes.Tokens' --output text)
echo "Tokens DKIM: ${DKIM_TOKENS}"

# 4. Crear registros CNAME de DKIM en Route 53
for TOKEN in ${DKIM_TOKENS}; do
  echo "Publicando CNAME para token DKIM: ${TOKEN}._domainkey.${DOMAIN}..."
  aws route53 change-resource-record-sets --hosted-zone-id "${ZONE_ID}" --change-batch "{
    \"Changes\": [
      {
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"${TOKEN}._domainkey.${DOMAIN}.\",
          \"Type\": \"CNAME\",
          \"TTL\": 300,
          \"ResourceRecords\": [
            { \"Value\": \"\\\"${TOKEN}.dkim.amazonses.com\\\"\" }
          ]
        }
      }
    ]
  }"
done

# 5. Obtener token de verificación de dominio para SES v1/Cognito (si aplica)
VERIFICATION_TOKEN=$(aws ses get-identity-verification-attributes --identities "${DOMAIN}" --region "${REGION}" --query "VerificationAttributes.\"${DOMAIN}\".VerificationToken" --output text 2>/dev/null || true)

if [ -n "${VERIFICATION_TOKEN}" ] && [ "${VERIFICATION_TOKEN}" != "None" ]; then
  echo "Publicando registro TXT _amazonses.${DOMAIN}..."
  aws route53 change-resource-record-sets --hosted-zone-id "${ZONE_ID}" --change-batch "{
    \"Changes\": [
      {
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"_amazonses.${DOMAIN}.\",
          \"Type\": \"TXT\",
          \"TTL\": 300,
          \"ResourceRecords\": [
            { \"Value\": \"\\\"${VERIFICATION_TOKEN}\\\"\" }
          ]
        }
      }
    ]
  }"
fi

# 6. Configurar Cognito User Pool para usar la identidad de Amazon SES
USER_POOL_ID="us-west-1_pGyxBNhWT"
echo "Vinculando Cognito User Pool ${USER_POOL_ID} con Amazon SES (us-west-1)..."
aws cognito-idp update-user-pool --user-pool-id "${USER_POOL_ID}" --region "${REGION}" \
  --email-configuration "SourceArn=arn:aws:ses:${REGION}:$(aws sts get-caller-identity --query Account --output text):identity/${DOMAIN},EmailSendingAccount=DEVELOPER,From=soporte@${DOMAIN}" || true

echo "=============================================================="
echo "¡Configuración de SES y Route 53 finalizada!"
echo "IMPORTANTE - ESTADO DE SANDBOX:"
echo "Si la cuenta AWS está en SES Sandbox, solo podrá enviar correos a direcciones"
echo "verificadas. Para enviar invitaciones a cualquier correo, solicita acceso a"
echo "producción en la consola de AWS SES (Support > Request Production Access)."
echo "=============================================================="
