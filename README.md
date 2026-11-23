# SeToTes

Tienda online de tote bags, neceseres, fundas y telas. Aplicación completa con frontend en Angular, API REST en Node/Express y base de datos PostgreSQL: catálogo por categorías, carrito persistente, pedidos con control de stock y un panel de administración para gestionar productos y pedidos.

## Stack

| Capa | Tecnologías |
| --- | --- |
| Frontend | Angular 21 (componentes standalone, control flow `@if`/`@for`), RxJS, formularios reactivos, Tailwind CSS 4 |
| Backend | Node.js, Express 5 (CommonJS), `pg` con SQL escrito a mano, argon2, jsonwebtoken, cookie-parser, cors, dotenv |
| Base de datos | PostgreSQL 16 |

## Funcionalidades

**Clientes**
- Catálogo con una página por categoría (`/bolsas`, `/neceseres`, `/fundas`, `/telas`).
- Registro e inicio de sesión. Contraseñas con hash argon2.
- Perfil de usuario editable (nombre, teléfono, email, dirección, ciudad y código postal).
- Carrito guardado en la base de datos: añadir productos, cambiar cantidades y quitarlos, con comprobación de stock.
- Checkout con datos de envío y gastos de envío fijos.
- Historial de pedidos y detalle de cada pedido.

**Administración** (rol `admin`)
- Crear y editar productos (nombre, precio, stock, color y categoría).
- Listado de todos los pedidos con filtro por estado, y detalle con datos del cliente y del envío.
- Cambio de estado de los pedidos según transiciones permitidas. Al cancelar un pedido se devuelve el stock.

## Puesta en marcha

Requisitos: Node.js, npm, Angular CLI y PostgreSQL.

### 1. Base de datos

```bash
createdb -U <usuario> totebag_db
psql -U <usuario> -d totebag_db -f backend/database/schema.sql
```

Más detalles sobre migraciones y cómo regenerar el esquema en [backend/database/README.md](backend/database/README.md).

### 2. Backend (http://localhost:3000)

```bash
cd backend
npm install
cp .env.example .env   # y rellena los valores reales
npm run dev            # node --watch: se reinicia al guardar cambios
```

Para arrancarlo sin recarga automática: `npm start`.

El servidor no arranca si falta `JWT_SECRET` en `backend/.env`.

Variables de entorno (todas en [backend/.env.example](backend/.env.example)):

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto del backend (por defecto `3000`). |
| `NODE_ENV` | `production` activa la cookie `secure` y hace obligatoria `CORS_ORIGIN`. |
| `CORS_ORIGIN` | Orígenes permitidos por CORS, separados por comas (`https://a.com,https://b.com`). En desarrollo, si no se define, se usa `http://localhost:4200`. En producción el servidor no arranca sin ella. No se admite `*` porque las peticiones llevan credenciales. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a PostgreSQL. |
| `JWT_SECRET` | Secreto para firmar los JWT. Obligatorio. |

### 3. Frontend (http://localhost:4200)

Desde la raíz del proyecto:

```bash
npm install
ng serve
```

La URL de la API está en un único sitio: la constante `API_BASE_URL` de `src/app/core/config/api.config.ts`, que sale de `src/environments/`. En desarrollo (`ng serve`) es `http://localhost:3000`; en el build de producción es relativa (`/api/...`), porque Express sirve el frontend y la API desde el mismo origen. Todos los servicios construyen sus URLs a partir de ella (`${API_BASE_URL}/api/...`) y los interceptores reconocen las peticiones a la API por el prefijo `/api/`. En desarrollo, el origen del frontend tiene que estar incluido en `CORS_ORIGIN` del backend.

### 4. Producción en un solo servicio

```bash
npm run start:prod
```

Compila el frontend (`ng build`, configuración de producción) y arranca el backend con `NODE_ENV=production`, que sirve el build de Angular y la API desde el mismo origen, con su propia CSP. La carpeta del build se puede cambiar con `FRONTEND_DIST_DIR`. En producción, `env.js` exige https, `JWT_SECRET` largo, SMTP y Stripe (ver `backend/.env.example`).

Para desplegar en un contenedor (Render), el `Dockerfile` de la raíz compila el frontend y empaqueta el backend con el build en una sola imagen:

```bash
docker build -t setotes .
```

Las variables de entorno se configuran en la plataforma, nunca en la imagen. En Render, la ruta de healthcheck es `/api/health`, y `PORT` la pone la propia plataforma.

## Desarrollo con Docker (opcional)

`docker-compose.yml` levanta PostgreSQL 16.15 y el backend en contenedores. **Solo para desarrollo local: no es una configuración de producción.** El frontend sigue con `ng serve` en la máquina.

```bash
cp .env.docker.example .env.docker      # una vez: rellenar con valores propios (no se versiona)
docker compose up -d --build            # construir y levantar (db + api)
docker compose ps                       # estado: ambos deben estar "healthy"
docker compose logs -f api              # logs del backend (aquí salen los emails en modo console)
docker compose restart api              # reiniciar solo el backend
docker compose down                     # parar; los datos y las imágenes se conservan
docker compose down -v                  # parar y BORRAR la base de datos y las imágenes subidas
```

Aplicar una migración nueva (initdb solo carga `schema.sql` con el volumen vacío):

```bash
docker compose exec -T db psql -1 -v ON_ERROR_STOP=1 -U totebag -d totebag_db < backend/database/migrations/NNN_descripcion.sql
```

Dar rol de administrador a un usuario registrado (la base de datos del compose empieza vacía):

```bash
docker compose exec db psql -U totebag -d totebag_db -c "UPDATE users SET role = 'admin' WHERE email = 'tu@email.com'"
```

- Antes de levantarlo, para el backend local (`npm run dev`): los dos usan el puerto 3000.
- PostgreSQL del compose: `127.0.0.1:5433` (no choca con un PostgreSQL local en el 5432).
- Stripe CLI funciona igual: `stripe listen --events checkout.session.completed,checkout.session.expired --forward-to localhost:3000/api/payments/webhook`.
- `schema.sql` solo se carga la primera vez (volumen vacío). Para empezar de cero: `docker compose down -v`.

### Imágenes en MinIO (compatible con S3)

Por defecto las imágenes se guardan en disco (`STORAGE_DRIVER=local`). Para probar el almacenamiento S3 con MinIO:

```bash
# en .env.docker: STORAGE_DRIVER=s3 (y MINIO_ROOT_* y S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY con valores propios)
docker compose --profile s3 up -d --build
docker compose ps                         # minio-init "Exited (0)" es lo normal: solo se ejecuta una vez
```

- Consola de MinIO: http://127.0.0.1:9001 (usuario `MINIO_ROOT_USER`).
- Las imágenes se descargan desde `http://localhost:9000/totebag-images/products/...` sin credenciales; listar el bucket o escribir sin credenciales está prohibido.
- Pasar las imágenes que ya había en disco: `docker compose exec api node scripts/migrate-images-to-storage.js --dry-run` (simulación) y después sin `--dry-run`. No borra los archivos locales.
- Volver a disco: `STORAGE_DRIVER=local` en `.env.docker` y `docker compose up -d`.
- La imagen de MinIO está congelada (MinIO ya no publica imágenes): solo para desarrollo.

## Estructura

```
.
├── src/app/
│   ├── core/
│   │   ├── config/          # URL base de la API
│   │   ├── guards/          # authGuard, adminGuard
│   │   ├── interceptors/    # credenciales y sesión caducada (401)
│   │   ├── models/          # interfaces de datos
│   │   └── services/        # auth, productos, carrito, pedidos, pedidos (admin)
│   ├── features/            # pantallas, cargadas con lazy loading
│   │   ├── admin/           # rutas hijas: panel, productos, pedidos, detalle de pedido
│   │   ├── catalog/  checkout/  home/  login/  register/
│   │   ├── orders/  order-detail/  shopping-cart/  user-profile/
│   └── shared/
│       ├── components/navbar/
│       └── utils/form-utils.ts
└── backend/
    ├── app.js               # construye la app Express y monta las rutas
    ├── server.js            # solo arranca el servidor
    ├── db.js                # pool de conexiones PostgreSQL
    ├── config/              # carga de .env y constantes (categorías, estados, envío)
    ├── middleware/auth.js   # requireAuth, requireAdmin
    ├── routes/              # auth, products, cart, orders, admin-orders
    ├── utils/
    └── database/            # schema.sql y migraciones
```

Los imports del frontend usan los alias `@core/*`, `@features/*` y `@shared/*`.

## Decisiones técnicas

### Transacciones con bloqueo de filas
Crear un pedido es una sola transacción (`BEGIN`/`COMMIT`/`ROLLBACK` sobre un cliente del pool, liberado en `finally`). Las líneas del carrito y sus productos se bloquean con `SELECT … FOR UPDATE OF ci, p`, en orden por id de producto, antes de comprobar el stock. Así dos compras simultáneas del último artículo no pueden venderlo dos veces. Dentro de la misma transacción se crea el pedido, se copian las líneas, se descuenta el stock y se vacía el carrito. El cambio de estado de un pedido en administración también bloquea el pedido con `FOR UPDATE` y, si se cancela, devuelve el stock en la misma transacción.

### Precios calculados en el servidor
El cliente solo envía ids de producto, cantidades y datos de envío; nunca precios. Subtotal, gastos de envío y total se calculan en SQL a partir de la tabla `products`, con columnas `numeric`. Cada línea de pedido guarda el nombre y el precio unitario del momento de la compra, de modo que el pedido no cambia si después se edita el producto.

### Sesión en cookie httpOnly
Al iniciar sesión, el backend firma un JWT (HS256, 1 hora) y lo envía en la cookie `access_token` con `httpOnly`, `sameSite: 'lax'` y `secure` en producción. JavaScript no puede leer el token. El id de usuario se obtiene siempre del token, nunca del body, y las consultas de carrito y pedidos filtran por ese usuario. `requireAdmin` comprueba el rol en la base de datos en cada petición.

### Máquina de estados de pedidos
Los estados (`pending`, `paid`, `shipped`, `delivered`, `cancelled`) y sus transiciones válidas están definidos en `backend/config/constants.js`:

```
pending → paid | cancelled
paid    → shipped | cancelled
shipped → delivered
```

`delivered` y `cancelled` son finales. Una transición no permitida devuelve `409`. El detalle de pedido de administración devuelve `allowedStatuses`, y el frontend solo ofrece esas opciones. La base de datos también restringe los valores con un `CHECK`.

### Lazy loading
Todas las pantallas se cargan bajo demanda con `loadComponent`. La zona de administración es un grupo de rutas hijas (`loadChildren`) protegido con `canActivateChild: [adminGuard]`, así que su código solo se descarga cuando se entra en ella.

### Interceptor de sesión
Hay dos interceptores funcionales. `credentialsInterceptor` añade `withCredentials` solo a las peticiones dirigidas a la API, para que viaje la cookie. `authErrorInterceptor` detecta un `401` cuando el usuario tenía sesión (sesión caducada), limpia el estado del usuario y redirige a `/login`. Excluye el propio login, para que unas credenciales incorrectas no se traten como sesión caducada.
