# Imagen de PRODUCCIÓN: frontend (Angular) + backend (Express) en un solo contenedor (Render).
# Express sirve el build de Angular y la API desde el mismo origen (backend/middleware/frontend.js).
# docker-compose.yml NO usa este archivo: es solo para desarrollo (backend/Dockerfile).
#
# Misma base que backend/Dockerfile: Debian "slim" (no alpine, por los binarios de argon2 y
# sharp para glibc), versión exacta de Node 22 y de Debian para que la base no cambie sola.
#
# Ningún secreto entra en la imagen: las variables (JWT_SECRET, DATABASE_URL, Stripe, SMTP…) se
# configuran en el panel de Render. El .dockerignore de la raíz deja fuera todos los .env*.

# --- Etapa 1: build del frontend ---
FROM node:22.22.3-bookworm-slim AS frontend-build

WORKDIR /app

# Sin la pregunta de analítica de Angular CLI (no hay terminal interactiva en el build)
ENV NG_CLI_ANALYTICS=false

# Primero solo los manifiestos: mientras no cambien, Docker reutiliza la capa de npm ci
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Solo lo que necesita "ng build" (nada del backend)
COPY angular.json tsconfig.json tsconfig.app.json .postcssrc.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production

# --- Etapa 2: dependencias de producción del backend ---
FROM node:22.22.3-bookworm-slim AS backend-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Etapa 3: imagen final ---
FROM node:22.22.3-bookworm-slim AS runtime

ENV NODE_ENV=production
# Render inyecta PORT (server.js la usa); 3000 es solo el valor por defecto fuera de Render
ENV PORT=3000
# Es la ruta por defecto de config/env.js (../dist/ToteBag/browser desde backend/); se fija
# aquí para que se vea dónde está el build dentro de la imagen
ENV FRONTEND_DIST_DIR=/app/dist/ToteBag/browser

WORKDIR /app/backend

# Código, dependencias y build propiedad de root: el proceso (usuario node) puede leerlos,
# no modificarlos. Del frontend solo se copia el resultado del build (ni src ni node_modules)
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=frontend-build /app/dist/ToteBag/browser /app/dist/ToteBag/browser

# La única carpeta escribible: imágenes con STORAGE_DRIVER=local. En Render el disco del
# contenedor se pierde en cada despliegue: en producción, STORAGE_DRIVER=s3
RUN mkdir -p uploads/products && chown -R node:node uploads

# Usuario sin privilegios que ya trae la imagen oficial de Node (uid 1000)
USER node

EXPOSE 3000

# Healthcheck con Node (sin curl). Render no usa este HEALTHCHECK: allí se configura
# "Health Check Path" = /api/health en el panel
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# node directamente, sin shell ni npm: Node es el PID 1 y recibe el SIGTERM de la plataforma
# para el cierre ordenado (server.js)
CMD ["node", "server.js"]
