const jwt = require('jsonwebtoken');

const pool = require('../db');

function requireAuth(request, response, next) {
  const token = request.cookies?.access_token;

  if (!token) {
    return response.status(401).json({
      message: 'Necesitas iniciar sesión',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] }
    );

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return response.status(401).json({
        message: 'La sesión no es válida',
      });
    }

    request.authenticatedUserId = payload.sub;
    return next();
  } catch {
    return response.status(401).json({
      message: 'La sesión no es válida o ha caducado',
    });
  }
}

async function requireAdmin(request, response, next) {
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [request.authenticatedUserId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return response.status(403).json({
        message: 'No tienes permisos para realizar esta acción',
      });
    }

    return next();
  } catch (error) {
    console.error('Error al comprobar los permisos:', error.message);
    return response.status(500).json({
      message: 'No se pudieron comprobar los permisos',
    });
  }
}

module.exports = { requireAuth, requireAdmin };
