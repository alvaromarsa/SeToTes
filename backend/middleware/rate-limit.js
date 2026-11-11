const { rateLimit } = require('express-rate-limit');

const { RATE_LIMITS } = require('../config/constants');

// Límite de intentos por IP para las rutas de autenticación (respuesta 429).
//
// IP real: se usa request.ip. Si algún día el backend va detrás de un proxy o balanceador
// (Nginx, Render, Heroku…), request.ip sería la del proxy y todos los clientes compartirían
// contador. Entonces hay que configurar en app.js app.set('trust proxy', <nº de proxies>),
// nunca "true" a ciegas: permitiría falsear la IP con la cabecera X-Forwarded-For.
//
// El contador vive en la memoria del proceso: se reinicia al reiniciar el backend y no se
// comparte entre varias instancias (para eso haría falta un almacén compartido, p. ej. Redis).
function createLimiter({ windowMinutes, max }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      message: `Has hecho demasiados intentos. Espera ${windowMinutes} minutos y vuelve a probar.`,
    },
  });
}

const loginLimiter = createLimiter(RATE_LIMITS.login);
const registerLimiter = createLimiter(RATE_LIMITS.register);
const forgotPasswordLimiter = createLimiter(RATE_LIMITS.forgotPassword);
const resetPasswordLimiter = createLimiter(RATE_LIMITS.resetPassword);

module.exports = { loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter };
