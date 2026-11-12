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

module.exports = { isProduction, corsOrigins, publicBaseUrl, frontendUrl, emailMode, smtp, stripe, trustProxy };
