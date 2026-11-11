const jwt = require('jsonwebtoken');

const pool = require('../db');
const { AUTH_COOKIE_NAME, clearAuthCookie } = require('../utils/auth-cookie');

const BLOCKED_ACCOUNT_MESSAGE = 'Tu cuenta está bloqueada. Contacta con la tienda.';
// Código estable para que el frontend reconozca este 403 sin depender del texto
const ACCOUNT_BLOCKED_CODE = 'ACCOUNT_BLOCKED';

// Además de verificar el JWT, consulta la base de datos en cada petición:
// así un bloqueo, un cambio de rol o un borrado tienen efecto inmediato,
// sin esperar a que caduque el token.
async function requireAuth(request, response, next) {
  const token = request.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return response.status(401).json({
      message: 'Necesitas iniciar sesión',
    });
  }

  let payload;

  try {
    payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] }
    );
  } catch {
    return response.status(401).json({
      message: 'La sesión no es válida o ha caducado',
    });
  }

  // sub se firma como texto con el id numérico (ver el login en auth.routes.js)
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) {
    return response.status(401).json({
      message: 'La sesión no es válida',
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, role, is_blocked, password_changed_at FROM users WHERE id = $1',
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user) {
      clearAuthCookie(response);
      return response.status(401).json({
        message: 'La sesión no es válida',
      });
    }

    // Sesión emitida antes del último cambio de contraseña: deja de valer.
    // iat va en segundos, así que el cambio se redondea hacia abajo al segundo; si no, un
    // login hecho en el mismo segundo que el cambio se invalidaría por error. Contrapartida:
    // un token emitido en ese mismo segundo, pero justo antes del cambio, sigue siendo válido.
    if (
      user.password_changed_at &&
      (typeof payload.iat !== 'number' ||
        Math.floor(user.password_changed_at.getTime() / 1000) > payload.iat)
    ) {
      clearAuthCookie(response);
      return response.status(401).json({
        message: 'Tu sesión ha caducado. Inicia sesión de nuevo.',
      });
    }

    if (user.is_blocked) {
      clearAuthCookie(response);
      return response.status(403).json({
        code: ACCOUNT_BLOCKED_CODE,
        message: BLOCKED_ACCOUNT_MESSAGE,
      });
    }

    request.authenticatedUserId = payload.sub;
    request.authenticatedUserRole = user.role;
    return next();
  } catch (error) {
    console.error('Error al comprobar la sesión:', error.message);
    return response.status(500).json({
      message: 'No se pudo comprobar la sesión',
    });
  }
}

// Debe ir siempre detrás de requireAuth, que ya ha leído el rol de la base de datos
function requireAdmin(request, response, next) {
  if (request.authenticatedUserRole !== 'admin') {
    return response.status(403).json({
      message: 'No tienes permisos para realizar esta acción',
    });
  }

  return next();
}

module.exports = { requireAuth, requireAdmin, ACCOUNT_BLOCKED_CODE, BLOCKED_ACCOUNT_MESSAGE };
