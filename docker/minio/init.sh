#!/usr/bin/env bash
# Inicialización de MinIO (SOLO desarrollo). La ejecuta el servicio minio-init del compose.
# Idempotente: se puede repetir sin romper nada.
#   1. Crea el bucket.
#   2. Lectura anónima SOLO de products/* (s3:GetObject): sin listado y sin escritura.
#   3. Usuario para la API con permisos mínimos (subir, leer y borrar en products/*),
#      para que la API nunca use las credenciales de administrador.
set -euo pipefail

# HOME no es escribible para el usuario de la imagen
export MC_CONFIG_DIR=/tmp/.mc

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

mc mb --ignore-existing "local/$S3_BUCKET"
mc anonymous set-json /init/anonymous-read-products.json "local/$S3_BUCKET"

mc admin policy create local totebag-api /init/api-policy.json
mc admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
# Falla si la política ya estaba adjuntada (ejecución anterior): no es un error
mc admin policy attach local totebag-api --user "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 || true

echo "MinIO listo: bucket $S3_BUCKET, lectura pública solo de products/*, usuario de la API con permisos mínimos"
