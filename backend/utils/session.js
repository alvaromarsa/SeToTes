const jwt = require('jsonwebtoken');

const { AUTH_COOKIE_MAX_AGE_MS, setAuthCookie } = require('./auth-cookie');

// Inicio de sesión compartido por el login y el registro: firma el JWT y lo deja
// en la cookie httpOnly. El token caduca a la vez que la cookie.
function startSession(response, userId) {
  const token = jwt.sign(
    { sub: String(userId) },
    process.env.JWT_SECRET,
    {
      expiresIn: AUTH_COOKIE_MAX_AGE_MS / 1000,
      algorithm: 'HS256',
    }
  );

  setAuthCookie(response, token);
}

// Datos del usuario que se devuelven al iniciar sesión (nunca password_hash)
function formatSessionUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    created_at: row.created_at,
    role: row.role,
  };
}

module.exports = { startSession, formatSessionUser };
