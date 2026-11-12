const { cancelOrderAndRestock } = require('../../utils/orders');

// Lógica de pago de pedidos COMPARTIDA por el webhook de Stripe (routes/payments.routes.js)
// y la reconciliación (jobs/reconcile-stripe-orders.js): las dos vías aplican exactamente las
// mismas comprobaciones. Quien llama debe estar en una transacción; estas funciones bloquean
// el pedido con FOR UPDATE y deciden con el estado ya bloqueado, así que, si el webhook y el
// job llegan a la vez, el segundo espera y encuentra el pedido ya resuelto.

// Siempre por el id de sesión guardado en el pedido (no por metadata): solo vale la sesión vigente
async function lockOrderBySession(client, sessionId) {
  const result = await client.query(
    `SELECT id, status, (total * 100)::integer AS total_cents
     FROM orders
     WHERE stripe_checkout_session_id = $1
     FOR UPDATE`,
    [sessionId]
  );

  return result.rows[0] ?? null;
}

// El ÚNICO sitio donde un pedido pasa a 'paid'.
// transitioned: true solo si el pedido ha pasado de verdad de 'pending' a 'paid'. El email de
// confirmación se envía tras el COMMIT y solo en ese caso: nunca sale dos veces.
async function markOrderPaidFromSession(client, session) {
  // Con tarjeta el pago queda resuelto al completar la sesión; otro estado no es un cobro
  if (session.payment_status !== 'paid') {
    return { orderId: null, transitioned: false };
  }

  const order = await lockOrderBySession(client, session.id);

  if (!order) {
    console.error(`Pago de Stripe sin pedido asociado (sesión ${session.id}): revisar en el panel de Stripe`);
    return { orderId: null, transitioned: false };
  }

  // Pago llegado tarde (la sesión caducó o el pedido se canceló): ni se resucita ni se toca el stock
  if (order.status === 'cancelled') {
    console.error(`PAGO RECIBIDO PARA PEDIDO CANCELADO #${order.id}: reembolsar manualmente en Stripe`);
    return { orderId: order.id, transitioned: false };
  }

  // Ya pagado, enviado o entregado: nada que hacer
  if (order.status !== 'pending') {
    return { orderId: order.id, transitioned: false };
  }

  // Lo cobrado debe ser exactamente el total del pedido (céntimos enteros, calculados en SQL)
  if (session.currency !== 'eur' || session.amount_total !== order.total_cents) {
    console.error(
      `IMPORTE NO COINCIDE en el pedido #${order.id}: Stripe ${session.amount_total} ${session.currency}, ` +
        `pedido ${order.total_cents} eur. No se marca como pagado; revisar en Stripe`
    );
    return { orderId: order.id, transitioned: false };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

  await client.query(
    `UPDATE orders
     SET status = 'paid', paid_at = now(), stripe_payment_intent_id = $2
     WHERE id = $1`,
    [order.id, paymentIntentId]
  );

  return { orderId: order.id, transitioned: true };
}

// La sesión vigente caducó sin pagar: si el pedido sigue 'pending', se cancela y vuelve el stock.
// cancelled: true solo si esta llamada lo ha cancelado.
async function cancelExpiredOrder(client, session) {
  const order = await lockOrderBySession(client, session.id);

  if (order?.status !== 'pending') {
    return { orderId: order?.id ?? null, cancelled: false };
  }

  await cancelOrderAndRestock(client, order.id);
  return { orderId: order.id, cancelled: true };
}

module.exports = { markOrderPaidFromSession, cancelExpiredOrder };
