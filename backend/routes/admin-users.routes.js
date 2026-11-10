const express = require('express');

const pool = require('../db');
const { USER_ROLES, USER_STATUSES } = require('../config/constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ADMIN_USER_COLUMNS, formatAdminUser } = require('../utils/users');

// Montado en /api/admin/users.
// Reglas: un admin no puede actuar sobre su propia cuenta y la tienda nunca
// puede quedarse sin ningún admin activo (no bloqueado).
const router = express.Router();

router.use(requireAuth, requireAdmin);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;

class AdminUserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Entero positivo escrito solo con dígitos; null si no lo es
function parsePositiveInteger(value) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function isSelf(request, userId) {
  return Number(request.authenticatedUserId) === userId;
}

// Los comodines de ILIKE se buscan como texto literal
function escapeLikePattern(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

// Bloquea, en un orden fijo (por id) para evitar interbloqueos, la fila del usuario
// afectado y las de todos los admins. Dos admins actuando a la vez se serializan aquí.
async function lockUserAndAdmins(client, userId) {
  const result = await client.query(
    `SELECT id, role, is_blocked
     FROM users
     WHERE id = $1 OR role = 'admin'
     ORDER BY id
     FOR UPDATE`,
    [userId]
  );

  const target = result.rows.find((row) => row.id === userId);

  if (!target) {
    throw new AdminUserError(404, 'No se encontró el usuario');
  }

  return { target, lockedRows: result.rows };
}

// Solo aplica si el afectado es un admin activo y la acción lo deja de ser.
// Se cuenta sobre las filas ya bloqueadas, no sobre lo que vio requireAuth:
// el admin que actúa podría estar siendo bloqueado a la vez por otro.
function ensureAnotherActiveAdmin(target, lockedRows) {
  if (target.role !== 'admin' || target.is_blocked) {
    return;
  }

  const otherActiveAdmins = lockedRows.filter(
    (row) => row.role === 'admin' && !row.is_blocked && row.id !== target.id
  );

  if (otherActiveAdmins.length === 0) {
    throw new AdminUserError(
      409,
      'Debe quedar al menos otro administrador activo: la tienda no puede quedarse sin administradores'
    );
  }
}

// details nunca lleva datos personales: solo roles o estados
async function logAdminAction(client, adminId, action, targetUserId, details = null) {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
     VALUES ($1, $2, $3, $4)`,
    [adminId, action, targetUserId, details]
  );
}

async function selectAdminUser(db, userId) {
  const result = await db.query(
    `SELECT ${ADMIN_USER_COLUMNS}
     FROM users u
     WHERE u.id = $1`,
    [userId]
  );

  return formatAdminUser(result.rows[0]);
}

router.get('/', async (request, response) => {
  const { search, role, status, page, pageSize } = request.query;

  const pageNumber = page === undefined ? 1 : parsePositiveInteger(page);
  const pageSizeNumber = pageSize === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInteger(pageSize);

  if (
    (search !== undefined && (typeof search !== 'string' || search.length > MAX_SEARCH_LENGTH)) ||
    (role !== undefined && !USER_ROLES.includes(role)) ||
    (status !== undefined && !USER_STATUSES.includes(status)) ||
    pageNumber === null ||
    pageSizeNumber === null ||
    pageSizeNumber > MAX_PAGE_SIZE
  ) {
    return response.status(400).json({
      message: 'Los filtros de búsqueda no son válidos',
    });
  }

  // Filtros opcionales: cada uno añade su condición y su parámetro ($1, $2…)
  const conditions = [];
  const params = [];

  const searchText = search?.trim() ?? '';
  if (searchText !== '') {
    params.push(`%${escapeLikePattern(searchText)}%`);
    conditions.push(
      `(u.full_name ILIKE $${params.length} ESCAPE '\\' OR u.email ILIKE $${params.length} ESCAPE '\\')`
    );
  }

  if (role !== undefined) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }

  if (status !== undefined) {
    params.push(status === 'blocked');
    conditions.push(`u.is_blocked = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::integer AS total FROM users u ${where}`,
      params
    );

    const itemsResult = await pool.query(
      `SELECT ${ADMIN_USER_COLUMNS}
       FROM users u
       ${where}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSizeNumber, (pageNumber - 1) * pageSizeNumber]
    );

    return response.json({
      items: itemsResult.rows.map(formatAdminUser),
      total: countResult.rows[0].total,
      page: pageNumber,
      pageSize: pageSizeNumber,
    });
  } catch (error) {
    console.error('Error al consultar los usuarios (admin):', error.message);
    return response.status(500).json({
      message: 'No se pudieron cargar los usuarios',
    });
  }
});

router.patch('/:id/block', async (request, response) => {
  const userId = parseId(request.params.id);
  const { blocked } = request.body ?? {};

  if (userId === null || typeof blocked !== 'boolean') {
    return response.status(400).json({
      message: 'Los datos de bloqueo no son válidos',
    });
  }

  if (isSelf(request, userId)) {
    return response.status(403).json({
      message: 'No puedes bloquear ni desbloquear tu propia cuenta',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { target, lockedRows } = await lockUserAndAdmins(client, userId);

    // Ya estaba en ese estado: no es un error ni se registra nada (idempotente)
    if (target.is_blocked !== blocked) {
      if (blocked) {
        ensureAnotherActiveAdmin(target, lockedRows);
      }

      await client.query(
        `UPDATE users
         SET is_blocked = $1::boolean,
             blocked_at = CASE WHEN $1::boolean THEN now() ELSE NULL END
         WHERE id = $2`,
        [blocked, userId]
      );

      await logAdminAction(
        client,
        request.authenticatedUserId,
        blocked ? 'user_blocked' : 'user_unblocked',
        userId
      );
    }

    const user = await selectAdminUser(client, userId);

    await client.query('COMMIT');

    return response.json(user);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof AdminUserError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al bloquear o desbloquear el usuario:', error.message);
    return response.status(500).json({
      message: 'No se pudo cambiar el estado del usuario',
    });
  } finally {
    client.release();
  }
});

router.patch('/:id/role', async (request, response) => {
  const userId = parseId(request.params.id);
  const { role } = request.body ?? {};

  if (userId === null || !USER_ROLES.includes(role)) {
    return response.status(400).json({
      message: 'El rol no es válido',
    });
  }

  if (isSelf(request, userId)) {
    return response.status(403).json({
      message: 'No puedes cambiar tu propio rol',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { target, lockedRows } = await lockUserAndAdmins(client, userId);

    // Mismo rol que ya tenía: no es un error ni se registra nada (idempotente)
    if (target.role !== role) {
      if (role !== 'admin') {
        ensureAnotherActiveAdmin(target, lockedRows);
      }

      await client.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);

      await logAdminAction(client, request.authenticatedUserId, 'user_role_changed', userId, {
        from: target.role,
        to: role,
      });
    }

    const user = await selectAdminUser(client, userId);

    await client.query('COMMIT');

    return response.json(user);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof AdminUserError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al cambiar el rol del usuario:', error.message);
    return response.status(500).json({
      message: 'No se pudo cambiar el rol del usuario',
    });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (request, response) => {
  const userId = parseId(request.params.id);

  if (userId === null) {
    return response.status(400).json({
      message: 'El usuario no es válido',
    });
  }

  if (isSelf(request, userId)) {
    return response.status(403).json({
      message: 'No puedes eliminar tu propia cuenta',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { target, lockedRows } = await lockUserAndAdmins(client, userId);

    const orders = await client.query(
      'SELECT EXISTS (SELECT 1 FROM orders WHERE user_id = $1) AS has_orders',
      [userId]
    );

    if (orders.rows[0].has_orders) {
      throw new AdminUserError(409, 'Este usuario tiene pedidos. Bloquéalo en lugar de eliminarlo.');
    }

    ensureAnotherActiveAdmin(target, lockedRows);

    // cart_items se borra solo (ON DELETE CASCADE en cart_items_user_id_fkey)
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await logAdminAction(client, request.authenticatedUserId, 'user_deleted', userId, {
      role: target.role,
    });

    await client.query('COMMIT');

    return response.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof AdminUserError) {
      return response.status(error.status).json({ message: error.message });
    }

    // Pedido creado por ese usuario justo a la vez: la clave ajena orders_user_id_fkey lo impide
    if (error.code === '23503') {
      return response.status(409).json({
        message: 'Este usuario tiene pedidos. Bloquéalo en lugar de eliminarlo.',
      });
    }

    console.error('Error al eliminar el usuario:', error.message);
    return response.status(500).json({
      message: 'No se pudo eliminar el usuario',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
