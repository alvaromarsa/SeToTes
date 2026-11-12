const express = require('express');

const pool = require('../db');
const { notifyOrderPaid } = require('../services/email/order-notifications');
const { constructWebhookEvent } = require('../services/payments/stripe');
const { cancelOrderAndRestock } = require('../utils/orders');

// Montado en /api/payments ANTES de express.json() (ver app.js): la firma de Stripe se
// calcula sobre el cuerpo exacto, byte a byte, y hay que verificarla con el cuerpo crudo.
// Sin requireAuth: la autenticación de esta ruta es la firma. Nunca se registra el cuerpo
// del evento ni datos de pago.
const router = express.Router();

// checkout.session.completed: el ÚNICO sitio donde un pedido pasa a 'paid'.
// Devuelve una función para ejecutar tras el COMMIT (el email) o null.
async function handleCheckoutCompleted(client, session) {
  // Con tarjeta el pago queda resuelto al completar la sesión; otro estado no es un cobro
  if (session.payment_status !== 'paid') {
    return null;
  }

  // Por el id de sesión guardado en el pedido, no por metadata: así solo vale la sesión vigente
  const result = await client.query(
    `SELECT id, status, (total * 100)::integer AS total_cents
     FROM orders
     WHERE stripe_checkout_session_id = $1
     FOR UPDATE`,
    [session.id]
  );
  const order = result.rows[0];

  if (!order) {
    console.error(`Pago de Stripe sin pedido asociado (sesión ${session.id}): revisar en el panel de Stripe`);
    return null;
  }

  // Pago llegado tarde (la sesión caducó o el pedido se canceló): ni se resucita ni se toca el stock
  if (order.status === 'cancelled') {
    console.error(`PAGO RECIBIDO PARA PEDIDO CANCELADO #${order.id}: reembolsar manualmente en Stripe`);
    return null;
  }

  // Ya pagado, enviado o entregado: nada que hacer
  if (order.status !== 'pending') {
    return null;
  }

  // Lo cobrado debe ser exactamente el total del pedido (céntimos enteros, calculados en SQL)
  if (session.currency !== 'eur' || session.amount_total !== order.total_cents) {
    console.error(
      `IMPORTE NO COINCIDE en el pedido #${order.id}: Stripe ${session.amount_total} ${session.currency}, ` +
        `pedido ${order.total_cents} eur. No se marca como pagado; revisar en Stripe`
    );
    return null;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

  await client.query(
    `UPDATE orders
     SET status = 'paid', paid_at = now(), stripe_payment_intent_id = $2
     WHERE id = $1`,
    [order.id, paymentIntentId]
  );

  return () => notifyOrderPaid(order.id);
}

// checkout.session.expired: la sesión vigente caducó sin pagar → se cancela y vuelve el stock
async function handleCheckoutExpired(client, session) {
  const result = await client.query(
    'SELECT id, status FROM orders WHERE stripe_checkout_session_id = $1 FOR UPDATE',
    [session.id]
  );
  const order = result.rows[0];

  if (order?.status === 'pending') {
    await cancelOrderAndRestock(client, order.id);
  }

  return null;
}

const EVENT_HANDLERS = {
  'checkout.session.completed': handleCheckoutCompleted,
  'checkout.session.expired': handleCheckoutExpired,
};

// Límite propio del cuerpo crudo: los eventos de Stripe son pequeños; 1mb evita rechazar uno legítimo
router.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (request, response) => {
  const signature = request.headers['stripe-signature'];
  let event;

  try {
    if (typeof signature !== 'string' || !Buffer.isBuffer(request.body)) {
      throw new Error('Falta la firma o el cuerpo');
    }
    event = constructWebhookEvent(request.body, signature);
  } catch {
    // Firma inválida: no se procesa nada ni se registra el cuerpo
    return response.status(400).json({ message: 'Firma no válida' });
  }

  const handler = EVENT_HANDLERS[event.type];

  // Otros tipos de evento: se confirma la recepción y no se hace nada
  if (!handler) {
    return response.json({ received: true });
  }

  const client = await pool.connect();
  let afterCommit = null;

  try {
    await client.query('BEGIN');

    // Idempotencia: Stripe reintenta eventos. Si el id ya está, se procesó antes.
    // Va en la misma transacción: si algo falla, el ROLLBACK lo borra y Stripe podrá reintentar.
    const inserted = await client.query(
      `INSERT INTO stripe_events (event_id, type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.type]
    );

    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      return response.json({ received: true });
    }

    afterCommit = await handler(client, event.data.object);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // 500: Stripe reintentará el evento más tarde
    console.error(`Error al procesar el evento de Stripe ${event.id} (${event.type}):`, error.message);
    return response.status(500).json({ message: 'No se pudo procesar el evento' });
  } finally {
    client.release();
  }

  // El email va tras el COMMIT y en segundo plano (runInBackground dentro de notifyOrderPaid)
  afterCommit?.();

  return response.json({ received: true });
});

module.exports = router;
