#!/usr/bin/env bash
# Healthcheck de MinIO (la imagen no trae curl): GET /minio/health/live con /dev/tcp de bash.
# Sale con 0 si MinIO responde 200.
set -euo pipefail

exec 3<>/dev/tcp/127.0.0.1/9000
printf 'GET /minio/health/live HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
grep -q '200 OK' <&3
