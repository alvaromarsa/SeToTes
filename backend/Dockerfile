# Imagen del backend (Express). Base Debian "slim" y no alpine: argon2 y sharp descargan
# binarios precompilados para glibc (la libc de Debian); alpine usa musl y obligaría a
# compilarlos con herramientas dentro de la imagen. Versión exacta, igual que en local
# (Node 22) y con la versión de Debian fijada (bookworm) para que la base no cambie sola.

# --- Etapa 1: dependencias de producción ---
FROM node:22.22.3-bookworm-slim AS deps

WORKDIR /app

# Primero solo los manifiestos: mientras no cambien, Docker reutiliza esta capa (npm ci) en caché
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 2: imagen final ---
FROM node:22.22.3-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Código y dependencias propiedad de root: el proceso (usuario node) puede leerlos, no modificarlos
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# La única carpeta escribible: las imágenes subidas (storage/local.storage.js).
# Un volumen con nombre montado aquí hereda estos permisos la primera vez.
RUN mkdir -p uploads/products && chown -R node:node uploads

# Usuario sin privilegios que ya trae la imagen oficial de Node (uid 1000)
USER node

EXPOSE 3000

# Healthcheck con Node (sin instalar curl): GET /api/health → 200 solo si PostgreSQL responde
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# node directamente (no "npm start"): así Node es el PID 1 y recibe el SIGTERM de "docker stop"
# para el cierre ordenado (server.js). npm no siempre reenvía la señal a su proceso hijo, y
# Docker acabaría matándolo con SIGKILL sin cerrar conexiones ni el pool.
CMD ["node", "server.js"]
