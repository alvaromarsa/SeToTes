const express = require('express');

const pool = require('../db');
const { notifyOrderPaid } = require('../services/email/order-notifications');
const { cancelExpiredOrder, markOrderPaidFromSession } = require('../services/payments/order-payments');
const { constructWebhookEvent } = require('../services/payments/stripe');

// Montado en /api/payments ANTES de express.json() (ver app.js): la firma de Stripe se
// calcula sobre el cuerpo exacto, byte a byte, y hay que verificarla con el cuerpo crudo.
// Sin requireAuth: la autenticación de esta ruta es la firma. Nunca se registra el cuerpo
// del evento ni datos de pago.
const router = express.Router();

// Cada manejador aplica la lógica compartida (services/payments/order-payments.js, la misma que
// usa la reconciliación) y devuelve una función para ejecutar tras el COMMIT, o null.
async function handleCheckoutCompleted(client, session) {
  const { orderId, transitioned } = await markOrderPaidFromSession(client, session);

  // El email solo si este evento ha pasado el pedido a 'paid' (nunca duplicado)
  return transitioned ? () => notifyOrderPaid(orderId) : null;
}

async function handleCheckoutExpired(client, session) {
  await cancelExpiredOrder(client, session);
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
