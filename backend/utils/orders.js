class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function formatOrder(row) {
  return {
    id: row.id,
    status: row.status,
    subtotal: Number(row.subtotal),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    createdAt: row.created_at,
  };
}

// Cancela un pedido y devuelve su stock. Única implementación de la cancelación: la usan el
// admin, el webhook de Stripe (sesión caducada) y el job de pedidos abandonados.
// Quien la llama debe estar en una transacción, tener la fila del pedido bloqueada
// (FOR UPDATE) y haber comprobado que el pedido se puede cancelar.
async function cancelOrderAndRestock(client, orderId) {
  await client.query(
    `UPDATE products p
     SET stock = p.stock + oi.quantity
     FROM order_items oi
     WHERE oi.product_id = p.id AND oi.order_id = $1`,
    [orderId]
  );

  const result = await client.query(
    `UPDATE orders
     SET status = 'cancelled'
     WHERE id = $1
     RETURNING id, status, subtotal, shipping_cost, total, created_at`,
    [orderId]
  );

  return result.rows[0];
}

module.exports = { OrderError, formatOrder, cancelOrderAndRestock };
