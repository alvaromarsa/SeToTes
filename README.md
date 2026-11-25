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
- Catálogo con una página por categoría (`/categoria/<slug>`; las URL antiguas `/bolsas`, `/neceseres`, `/fundas` y `/telas` redirigen).
- Registro e inicio de sesión. Contraseñas con hash argon2.
- Perfil de usuario editable (nombre, teléfono, email, dirección, ciudad y código postal).
- Carrito guardado en la base de datos: añadir productos, cambiar cantidades y quitarlos, con comprobación de stock.
- Checkout con datos de envío y gastos de envío fijos.
- Historial de pedidos y detalle de cada pedido.

**Administración** (rol `admin`)
- Crear y editar productos (nombre, precio, stock, color y categoría).
- Crear, renombrar y borrar categorías (`/adminpanel/categories`): los cambios aparecen al momento en la navbar, el catálogo y el formulario de productos. Renombrar no cambia la URL; solo se borran categorías sin productos.
- Listado de todos los pedidos con filtro por estado, y detalle con datos del cliente y del envío.
- Cambio de estado de los pedidos según transiciones permitidas. Al cancelar un pedido se devuelve el stock.

## Puesta en marcha

Requisitos: Node.js, npm, Angular CLI y PostgreSQL.

### 1. Base de datos

```bash
createdb -U <usuario> totebag_db
psql -U <usuario> -d totebag_db -f backend/database/schema.sql
psql -v ON_ERROR_STOP=1 -U <usuario> -d totebag_db -f backend/database/seed.sql
```

`seed.sql` crea las 4 categorías iniciales y es **solo para una BD nueva** (nunca sobre una con datos reales). Más detalles sobre migraciones y cómo regenerar el esquema en [backend/database/README.md](backend/database/README.md).

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
- `schema.sql` y `seed.sql` solo se cargan la primera vez (volumen vacío). Para empezar de cero: `docker compose down -v`.

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
│   │   ├── config/          # URL base de la API, categoryPath
│   │   ├── guards/          # authGuard, adminGuard
│   │   ├── interceptors/    # credenciales y sesión caducada (401)
│   │   ├── models/          # interfaces de datos
│   │   └── services/        # auth, productos, categorías, carrito, pedidos, pedidos (admin)
│   ├── features/            # pantallas, cargadas con lazy loading
│   │   ├── admin/           # rutas hijas: panel, productos, categorías, pedidos, usuarios, ajustes
│   │   ├── catalog/  checkout/  home/  login/  register/
│   │   ├── orders/  order-detail/  shopping-cart/  user-profile/
│   └── shared/
│       ├── components/navbar/
│       └── utils/form-utils.ts
└── backend/
    ├── app.js               # construye la app Express y monta las rutas
    ├── server.js            # solo arranca el servidor
    ├── db.js                # pool de conexiones PostgreSQL
    ├── config/              # carga de .env y constantes (estados, envío)
    ├── middleware/auth.js   # requireAuth, requireAdmin
    ├── routes/              # auth, products, categories, cart, orders, admin-*
    ├── utils/
    └── database/            # schema.sql, seed.sql y migraciones
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
Todas las pantallas se cargan bajo demanda con `loadComponent`. La zona de administración es un grupo de rutas hijas (`loadChildren`) protegido con `canMatch: [adminGuard]`: el guard decide antes de descargar el código, así que un cliente o un visitante sin sesión nunca lo descarga.

### Categorías dinámicas
Las categorías están en la tabla `categories` (migración `007_categories.sql`: `slug` único, `name`, `position`; migración `008_category_name_key.sql`: `name_key`, el nombre normalizado y único), no en el código. `products.category` guarda el slug con una clave ajena a `categories.slug` (`ON DELETE RESTRICT`). Una BD nueva recibe las 4 categorías iniciales con `seed.sql`, que es solo para BD nuevas.

- **API** (las de administración, con sesión de admin: `requireAuth` + `requireAdmin`):

  | Endpoint | Qué hace | Respuestas |
  |---|---|---|
  | `GET /api/categories` | Lista pública, en orden (`position, id`). `no-cache` + ETag: revalida en cada uso y responde `304` si no ha cambiado. | `200` |
  | `GET /api/admin/categories` | La misma lista con `productCount` de cada una (cuenta también los productos ocultos, que también impiden borrar). | `200` |
  | `POST /api/admin/categories` | Crea una con `{ name }` (cualquier otro campo se ignora). El servidor genera el slug (minúsculas, sin tildes, con guiones) y la posición (la última). | `201`; `400` nombre no válido o reservado (`login`, `checkout`…); `409` si choca con otra («Bolsas», «BOLSÁS» y «bolsas!» chocan) |
  | `PATCH /api/admin/categories/:id` | Renombra con `{ name }`: cambia SOLO el nombre, nunca el slug (las URL y los productos no se tocan). | `200`; `400`; `404`; `409` si el nombre es el de otra o su URL |
  | `DELETE /api/admin/categories/:id` | Borra solo si no tiene productos (ni ocultos); lo garantiza la clave ajena, sin carreras. Los pedidos no se ven afectados. | `204`; `400`; `404`; `409` «tiene N productos» (+ `productCount`) |

  Al crear o editar un producto se comprueba que su categoría existe.
- **Orden de despliegue:** primero la migración y después el backend. La `007` va ANTES del backend que lee la tabla; la `008`, justo antes del backend que escribe `name_key` (entre medias, crear una categoría con el backend anterior falla; leer y borrar siguen funcionando). Después, regenerar `schema.sql`. Ver [backend/database/README.md](backend/database/README.md).
- **Frontend:** `CategoryService` carga la lista una vez en una signal (con un reintento si falla) y la comparten la navbar, el catálogo, el detalle de producto, Novedades y la gestión de productos. Cada categoría vive en `/categoria/<slug>`; las URL antiguas (`/bolsas`…) redirigen. Crear, renombrar y borrar desde `/adminpanel/categories` se ve en todas partes sin recargar.
- **Borrar:** el botón «Borrar» de una categoría con productos no abre la confirmación: explica en la fila cuántos tiene. Sin productos, pide confirmación. Un enlace a una categoría borrada (también las URL antiguas) muestra «Categoría no encontrada» con un enlace a la portada, y la tienda funciona aunque no quede ninguna (Gestionar productos avisa de que hay que crear una antes).
- **Muchas categorías:** la fila de la navbar se desplaza en horizontal, con un degradado en el borde por el que queda más, y el tabulador lleva la vista hasta la categoría enfocada.
- **Pendiente:** reordenar y ocultar categorías; y, con más de 6 u 8, una página «Ver todas» o un menú desplegable.

### Interceptor de sesión
Hay dos interceptores funcionales. `credentialsInterceptor` añade `withCredentials` solo a las peticiones dirigidas a la API, para que viaje la cookie. `authErrorInterceptor` detecta un `401` cuando el usuario tenía sesión (sesión caducada), limpia el estado del usuario y redirige a `/login`. Excluye el propio login, para que unas credenciales incorrectas no se traten como sesión caducada.
