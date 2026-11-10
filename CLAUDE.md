# Tienda de tote bags

Tienda online (Angular + Node/Express + PostgreSQL) que pasará a producción como tienda real. También es proyecto de portfolio: el código debe ser claro, consistente y fácil de explicar en una entrevista.

## Estructura
- Raíz: aplicación Angular (`src/app/`). `backend/`: API Express.
- Frontend: `core/` (services, models, guards, interceptors, config), `features/` (pantallas, con lazy loading), `shared/` (navbar, utils).
- Backend: `app.js` construye la app, `server.js` solo arranca. `config/`, `middleware/auth.js`, `routes/*.routes.js` (montadas en `app.js`), `utils/`, `db.js`.

## Comandos
- Frontend: `ng serve`, `ng build` (debe compilar sin errores tras cada cambio).
- Backend: `cd backend && npm run dev` (`node --watch`, se reinicia solo al guardar; `npm start` sin recarga). CommonJS (`require`). Archivos `.js`, NO TypeScript.

## Backend
- Express 5, `pg` con SQL escrito a mano (sin ORM), argon2, jsonwebtoken en cookie httpOnly `access_token`, cookie-parser, cors, dotenv.
- Base de datos PostgreSQL `totebag_db`. Los cambios de esquema se escriben como archivos SQL numerados en `backend/database/migrations/` y los aplica el usuario a mano: NO ejecutes SQL contra la base de datos.
- Consultas siempre parametrizadas ($1, $2). Dinero en `numeric`, calculado en SQL/servidor, nunca recibido del cliente.
- Escrituras de varios pasos: transacción con `pool.connect()`, BEGIN/COMMIT/ROLLBACK y `client.release()` en `finally`. Bloqueo `FOR UPDATE` para stock.
- Seguridad: el id de usuario sale SIEMPRE de la cookie, nunca del body. Filtrar por propietario en datos del usuario. Rutas de admin con `requireAuth` y `requireAdmin`. Validar entradas y usar listas blancas. Errores 500 genéricos al cliente; el detalle, en el log del servidor.
- Respuestas JSON en camelCase, mensajes de error en español, códigos 400/401/403/404/409/500 con sentido. Los `numeric` se convierten con `Number()`.
- Variables de entorno: se cargan y validan en `config/env.js`; toda variable nueva va también en `backend/.env.example`. `CORS_ORIGIN` = orígenes separados por comas (por defecto `http://localhost:4200` en desarrollo, obligatoria en producción, nunca `*` porque se usan credenciales).
- Los productos tienen is_visible; los nuevos nacen ocultos; publicar exige >= 1 imagen; las rutas públicas solo muestran visibles y la administración usa /api/admin/products.
- NUNCA leas, edites, imprimas ni subas `.env` ni ningún secreto.

## Frontend
- Angular con componentes standalone, `@if`/`@for`, sin NgModules. Rutas con `loadComponent`/`loadChildren`.
- Alias de importación: `@core/*`, `@features/*`, `@shared/*`.
- HTTP con HttpClient. Los interceptores añaden credenciales y gestionan la sesión caducada (401). URL base en `core/config/api.config.ts`: los servicios usan SIEMPRE `API_BASE_URL` (importada desde `@core/config/api.config`), nunca una URL escrita a mano.
- Estado compartido: BehaviorSubject privado + `asObservable()` público. Componentes con OnPush y `markForCheck()` tras suscripciones. Formularios reactivos con `FormUtils`.
- Textos de interfaz en español; identificadores de código en inglés.

## Forma de trabajar
- Cambios pequeños, sin refactorizar código ajeno a la tarea. Respeta el estilo existente.
- Antes de una tarea grande, propón un plan y espera mi confirmación.
- Al terminar: compila, resume los cambios en español y explica las decisiones importantes.
- No hagas commits salvo que te lo pida. Convención: Conventional Commits (feat, fix, refactor, docs, chore).
