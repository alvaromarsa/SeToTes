// Columnas que se pueden devolver de un usuario en la administración.
// Se listan una a una para que password_hash nunca pueda colarse en una respuesta.
const ADMIN_USER_COLUMNS = `
  u.id, u.full_name, u.email, u.phone, u.role, u.is_blocked, u.blocked_at, u.created_at,
  (SELECT COUNT(*)::integer FROM orders o WHERE o.user_id = u.id) AS orders_count`;

function formatAdminUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isBlocked: row.is_blocked,
    blockedAt: row.blocked_at,
    createdAt: row.created_at,
    ordersCount: row.orders_count,
  };
}

module.exports = { ADMIN_USER_COLUMNS, formatAdminUser };
