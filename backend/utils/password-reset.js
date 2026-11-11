const crypto = require('node:crypto');

// 32 bytes aleatorios en base64url: 43 caracteres seguros para una URL
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function generateResetToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

// En la base de datos solo se guarda el hash: si alguien la lee, no puede usar los enlaces.
// SHA-256 basta (no hace falta argon2) porque el token es aleatorio y largo, no una contraseña.
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isWellFormedResetToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

module.exports = { generateResetToken, hashResetToken, isWellFormedResetToken };
