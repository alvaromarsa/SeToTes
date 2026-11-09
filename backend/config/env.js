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

module.exports = { corsOrigins };
