const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en backend/.env');
}

const DEFAULT_CORS_ORIGIN = 'http://localhost:4200';

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  throw new Error('Falta CORS_ORIGIN en backend/.env (obligatorio en producción)');
}

const corsOrigins = (process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN)
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

if (corsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN en backend/.env no contiene ningún origen');
}

if (corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN no puede ser "*" porque las peticiones llevan credenciales');
}

const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:3000';

if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_BASE_URL) {
  throw new Error('Falta PUBLIC_BASE_URL en backend/.env (obligatorio en producción)');
}

// Sin "/" final para poder concatenar rutas
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL)
  .trim()
  .replace(/\/+$/, '');

if (publicBaseUrl === '') {
  throw new Error('PUBLIC_BASE_URL en backend/.env está vacía');
}

const isProduction = process.env.NODE_ENV === 'production';

// URL del frontend, para construir los enlaces de los emails (sin "/" final)
const DEFAULT_FRONTEND_URL = 'http://localhost:4200';

if (isProduction && !process.env.FRONTEND_URL) {
  throw new Error('Falta FRONTEND_URL en backend/.env (obligatorio en producción)');
}

const frontendUrl = (process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL)
  .trim()
  .replace(/\/+$/, '');

if (frontendUrl === '') {
  throw new Error('FRONTEND_URL en backend/.env está vacía');
}

// Email: "console" imprime los emails en la terminal (solo fuera de producción);
// "smtp" los envía de verdad y exige todas las variables SMTP_* y EMAIL_FROM
const EMAIL_MODES = ['console', 'smtp'];
const emailMode = process.env.EMAIL_MODE ?? (isProduction ? 'smtp' : 'console');

if (!EMAIL_MODES.includes(emailMode)) {
  throw new Error('EMAIL_MODE en backend/.env debe ser "console" o "smtp"');
}

if (isProduction && emailMode !== 'smtp') {
  throw new Error('En producción EMAIL_MODE debe ser "smtp"');
}

const SMTP_VARIABLES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
let smtp = null;

if (emailMode === 'smtp') {
  const missing = SMTP_VARIABLES.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Faltan variables de email en backend/.env: ${missing.join(', ')}`);
  }

  const port = Number(process.env.SMTP_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT en backend/.env debe ser un número de puerto');
  }

  smtp = {
    host: process.env.SMTP_HOST.trim(),
    port,
    // 465 usa TLS desde el inicio; el resto (587) empieza en claro y pasa a TLS con STARTTLS
    secure: port === 465,
    user: process.env.SMTP_USER.trim(),
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM.trim(),
  };
}

// Stripe: obligatorias siempre, también en desarrollo (los pagos dependen de ellas)
const STRIPE_VARIABLES = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const missingStripe = STRIPE_VARIABLES.filter((name) => !process.env[name]?.trim());

if (missingStripe.length > 0) {
  throw new Error(`Faltan variables de Stripe en backend/.env: ${missingStripe.join(', ')}`);
}

const stripe = {
  secretKey: process.env.STRIPE_SECRET_KEY.trim(),
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET.trim(),
};

// Fuera de producción solo claves de prueba: evita cobrar de verdad por accidente
if (!isProduction && !stripe.secretKey.startsWith('sk_test_')) {
  throw new Error(
    'STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_...) fuera de producción'
  );
}

// Número de proxies delante del backend (balanceador de la plataforma). Con él, request.ip es
// la IP real del cliente y el límite de intentos funciona. Un número MAYOR que los proxies
// reales permite falsear la IP con X-Forwarded-For; 0 detrás de un proxy hace que todos los
// clientes compartan la IP del proxy. Nunca "true".
const trustProxyRaw = process.env.TRUST_PROXY?.trim() || '0';

if (!/^\d+$/.test(trustProxyRaw)) {
  throw new Error('TRUST_PROXY en backend/.env debe ser un número entero de proxies (0 si no hay ninguno)');
}

const trustProxy = Number(trustProxyRaw);

// Entero de una variable opcional; si falta, el valor por defecto. El error nombra la
// variable, nunca su valor.
function readInteger(name, defaultValue, min) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return defaultValue;
  }

  if (!/^\d+$/.test(raw) || Number(raw) < min) {
    throw new Error(`${name} en backend/.env debe ser un número entero mayor o igual que ${min}`);
  }

  return Number(raw);
}

function readBoolean(name, defaultValue) {
  const raw = process.env[name]?.trim().toLowerCase();

  if (!raw) {
    return defaultValue;
  }

  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`${name} en backend/.env debe ser "true" o "false"`);
  }

  return raw === 'true';
}

// Base de datos: DATABASE_URL (bases de datos gestionadas) o las variables DB_* sueltas.
// SSL activado por defecto en producción y SIEMPRE verificando el certificado del servidor:
// sin verificar, la conexión va cifrada pero un intermediario podría hacerse pasar por la
// base de datos. Si el proveedor usa su propia autoridad de certificación, se indica en
// DB_SSL_CA (PEM) en vez de desactivar la verificación.
// Ojo: un "sslmode=..." dentro de DATABASE_URL tiene prioridad sobre esta configuración en pg.
const DB_VARIABLES = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const databaseUrl = process.env.DATABASE_URL?.trim() || null;
const sslEnabled = readBoolean('DB_SSL', isProduction);
// En variables de entorno de una línea, los saltos del PEM suelen escribirse como \n
const sslCa = process.env.DB_SSL_CA?.trim().replace(/\\n/g, '\n') || null;

const database = {
  connectionString: databaseUrl,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? readInteger('DB_PORT', 5432, 1) : undefined,
  name: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: sslEnabled ? { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) } : false,
  poolMax: readInteger('DB_POOL_MAX', 10, 1),
  idleTimeoutMs: readInteger('DB_IDLE_TIMEOUT_MS', 30_000, 0),
  connectionTimeoutMs: readInteger('DB_CONNECTION_TIMEOUT_MS', 5_000, 0),
};

// Tiempo máximo para terminar las peticiones en curso al apagar el servidor (server.js)
const shutdownTimeoutMs = readInteger('SHUTDOWN_TIMEOUT_MS', 10_000, 0);

// Comprobaciones extra en producción: el servidor no arranca si algo crítico está mal.
// Los mensajes dicen QUÉ falta o está mal, nunca el valor (pueden ser secretos).
const JWT_SECRET_MIN_LENGTH = 32;

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

if (isProduction) {
  if (process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres en producción`);
  }

  // Cada origen de CORS: https y solo origen (sin ruta ni "/" final), p. ej. https://www.setotes.es
  const invalidOrigins = corsOrigins.filter((origin) => !isHttpsUrl(origin) || new URL(origin).origin !== origin);
  if (invalidOrigins.length > 0) {
    throw new Error(
      `CORS_ORIGIN tiene ${invalidOrigins.length} origen(es) no válidos: en producción cada uno debe ser https://dominio, sin ruta ni "/" final`
    );
  }

  for (const [name, value] of [['FRONTEND_URL', frontendUrl], ['PUBLIC_BASE_URL', publicBaseUrl]]) {
    if (!isHttpsUrl(value)) {
      throw new Error(`${name} debe ser una URL https válida en producción`);
    }
  }

  if (!databaseUrl) {
    const missingDb = DB_VARIABLES.filter((name) => !process.env[name]?.trim());
    if (missingDb.length > 0) {
      throw new Error(`Falta la configuración de la base de datos: define DATABASE_URL o ${missingDb.join(', ')}`);
    }
  }
}

module.exports = {
  isProduction,
  corsOrigins,
  publicBaseUrl,
  frontendUrl,
  emailMode,
  smtp,
  stripe,
  trustProxy,
  database,
  shutdownTimeoutMs,
};
