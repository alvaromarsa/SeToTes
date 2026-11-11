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
- Migraciones existentes (las aplica el usuario a mano): 001 (imágenes), 002 (visibilidad), 003 (usuarios), 004 (recuperación de contraseña).
- Usuarios (migración 003): `users.is_blocked` y `blocked_at`, y tabla `admin_audit_log` (sin FK, sin datos personales en `details`). Roles: `customer` | `admin` (CHECK `users_role_check`).
- `requireAuth` consulta la BD en cada petición (`id, role, is_blocked`): usuario inexistente → 401, bloqueado → 403 con `code: 'ACCOUNT_BLOCKED'` (también en el login, tras verificar la contraseña); en ambos casos limpia la cookie. Deja `authenticatedUserId` y `authenticatedUserRole`; `requireAdmin` usa ese rol sin otra consulta. Cookie de sesión solo a través de `utils/auth-cookie.js`; login y registro inician sesión con `startSession` (`utils/session.js`).
- Administración de usuarios (`/api/admin/users`): un admin no puede bloquearse, cambiarse el rol ni borrarse a sí mismo (403), y la tienda nunca puede quedarse sin un admin activo (409). Bloquear, cambiar el rol y borrar van en transacción con `FOR UPDATE` sobre el usuario afectado y todos los admins, y registran la acción en `admin_audit_log`.
- Variables de email (ver `.env.example`): `FRONTEND_URL` (enlaces de los emails; obligatoria en producción), `EMAIL_MODE` (`console` por defecto fuera de producción, `smtp` obligatorio en producción), `SMTP_HOST`, `SMTP_PORT` (465 = TLS directo), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (obligatorias en modo smtp; el servidor no arranca si faltan).
- Email (`services/email/`, abstracción como `storage/`): `sendEmail` y `sendEmailInBackground`; plantillas en `templates/`. Reglas: NUNCA esperar al email para responder (se envía tras el COMMIT, en segundo plano, y un fallo solo va a `console.error`); SIEMPRE escapar con `escapeHtml` cualquier dato metido en el HTML; nunca tokens ni contraseñas en logs (el modo console sí muestra el enlace, y solo existe fuera de producción). Emails de pedidos en `order-notifications.js` (creado; enviado y entregado).
- Trabajo en segundo plano siempre con `runInBackground` (`utils/background.js`): captura cualquier error y nunca deja una promesa rechazada sin capturar.
- Recuperación de contraseña (migración 004: `users.password_changed_at` y `password_reset_tokens`): tokens de 32 bytes guardados SOLO como hash SHA-256, 1 hora, un solo uso; pedir uno nuevo invalida los anteriores. forgot-password responde siempre lo mismo y al instante (todo el trabajo va en segundo plano para no delatar si la cuenta existe). reset-password no inicia sesión. `GET /api/auth/reset-password/validate?token=` solo comprueba el enlace (sin modificar nada) para que la pantalla avise al abrirla; el POST de reset vuelve a validarlo siempre (el enlace puede gastarse entre medias). Ambas rutas comparten el mismo limitador (un único contador).
- Sesiones previas al cambio de contraseña invalidadas: `requireAuth` compara `password_changed_at` (redondeado hacia abajo al segundo) con el `iat` del JWT. Hueco teórico conocido: un token emitido en el mismo segundo del cambio, pero justo antes, sigue siendo válido (se acepta para no invalidar por error el login hecho justo después del cambio).
- Límite de intentos (`middleware/rate-limit.js`, valores en `RATE_LIMITS` de `constants.js`): login, register, forgot-password y reset-password por IP, 429 en español. El contador vive en la memoria del proceso: se reinicia al reiniciar el backend y no se comparte entre instancias (con varias haría falta Redis). Detrás de un proxy hay que configurar `app.set('trust proxy', n)`.
- Pendiente: los tokens de recuperación caducados o usados no se borran nunca de la BD (no son peligrosos, solo ocupan sitio).
- NUNCA leas, edites, imprimas ni subas `.env` ni ningún secreto.

## Frontend
- Angular con componentes standalone, `@if`/`@for`, sin NgModules. Rutas con `loadComponent`/`loadChildren`.
- Alias de importación: `@core/*`, `@features/*`, `@shared/*`.
- HTTP con HttpClient. Los interceptores añaden credenciales y gestionan la sesión caducada (401). URL base en `core/config/api.config.ts`: los servicios usan SIEMPRE `API_BASE_URL` (importada desde `@core/config/api.config`), nunca una URL escrita a mano.
- Estado compartido: BehaviorSubject privado + `asObservable()` público. Componentes con OnPush y `markForCheck()` tras suscripciones. Formularios reactivos con `FormUtils`.
- Confirmaciones con `shared/components/confirm-dialog` (`<dialog>` nativo); nunca `window.confirm`/`alert`.
- `auth-error.interceptor` (solo peticiones a `API_BASE_URL`): 401 → limpia la sesión local y lleva a /login; 403 con `code === 'ACCOUNT_BLOCKED'` → limpia la sesión local, guarda el aviso en `SessionNoticeService` y lleva a /login (si no está ya allí). `clearSession()` nunca llama a /logout. El login muestra los avisos en su zona genérica `role="alert"`.
- Gestión de usuarios: `/adminpanel/users` (`features/admin/pages/user-management`), con `AdminUserService` y `core/models/admin-user.models.ts`.
- Todo error visible para el usuario pasa por getErrorMessage (`core/utils/http-error-message.ts`); nunca solo a consola; 5xx siempre genérico.
- Tras un error, el foco vuelve al botón que lanzó la petición (`shared/utils/focus-after-render.ts`); en los éxitos, no.
- Volver a donde estaba: los guards y los 401 llevan a `/login?returnUrl=...` con `loginUrlTree` (`core/utils/return-url.ts`); el login solo acepta rutas que pasan `isSafeReturnUrl` (evita redirecciones abiertas).
- `SessionNoticeService`: avisos entre pantallas con tipo (`error` en el login, `success` en el perfil); cada pantalla borra los de su tipo al salir.
- Pendiente: el error de carga del carrito al iniciar sesión (`CartService`) sigue yendo solo a consola.
- Textos de interfaz en español; identificadores de código en inglés.

## Legal (España, UE)
- Datos del titular y de la tienda solo en `core/config/legal.config.ts` (marcadores `[RELLENAR: ...]`). Páginas en `features/legal/` (/aviso-legal, /privacidad, /cookies, /condiciones, /envios-devoluciones) con la maquetación común `shared/components/legal-page` (ViewEncapsulation.None: todo selector de su CSS debe empezar por `.legal-page`). Pie de página en `shared/components/footer`.
- IMPORTANTE: los textos legales son una plantilla y deben ser revisados por un profesional antes de abrir la tienda. No son asesoría legal.
- No verificado: que la plataforma europea de resolución de litigios en línea (ODR) cerró el 20/07/2025 (por eso no se enlaza). Debe confirmarlo quien revise los textos.
- Cookies: solo la técnica `access_token` (httpOnly, 1 h); por eso no hay banner. Cualquier cookie no técnica, analítica o almacenamiento del navegador (localStorage, etc.) obliga a revisar la política de cookies y a pedir consentimiento.
- Gastos de envío escritos en dos sitios: `SHIPPING_COST` (backend, el que cobra) y `LEGAL_CONFIG.shipping.costEur` (texto legal); deben coincidir.
- Pendiente (prompt de pagos, al modificar POST /api/orders): guardar la aceptación en el backend — `terms_accepted_at` y `terms_version` en `orders`; `privacy_notice_version` en `users`. Hoy las casillas de registro y checkout solo se validan en el frontend.

## Forma de trabajar
- Cambios pequeños, sin refactorizar código ajeno a la tarea. Respeta el estilo existente.
- Antes de una tarea grande, propón un plan y espera mi confirmación.
- Al terminar: compila, resume los cambios en español y explica las decisiones importantes.
- No hagas commits salvo que te lo pida. Convención: Conventional Commits (feat, fix, refactor, docs, chore).
