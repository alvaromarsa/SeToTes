const pool = require('../db');
const { PENDING_ORDER_TTL_MINUTES } = require('../config/constants');
const { runInBackground } = require('../utils/background');
const { cancelOrderAndRestock } = require('../utils/orders');

const INTERVAL_MINUTES = 10;

// Pedidos 'pending' SIN sesión de Stripe (el cliente no llegó a la pasarela) con más de
// PENDING_ORDER_TTL_MINUTES: se cancelan y vuelve su stock. Los que tienen sesión los
// resuelve el evento checkout.session.expired del webhook.
async function cancelAbandonedOrders() {
  const candidates = await pool.query(
    `SELECT id
     FROM orders
     WHERE status = 'pending'
       AND stripe_checkout_session_id IS NULL
       AND created_at < now() - make_interval(mins => $1)`,
    [PENDING_ORDER_TTL_MINUTES]
  );

  let cancelled = 0;

  // Una transacción por pedido: un fallo en uno no deshace los demás
  for (const { id } of candidates.rows) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Se vuelve a comprobar con la fila bloqueada: entre la consulta de arriba y esta,
      // el cliente puede haber abierto la sesión de pago o el admin haber cancelado
      const locked = await client.query(
        `SELECT id
         FROM orders
         WHERE id = $1
           AND status = 'pending'
           AND stripe_checkout_session_id IS NULL
           AND created_at < now() - make_interval(mins => $2)
         FOR UPDATE`,
        [id, PENDING_ORDER_TTL_MINUTES]
      );

      if (locked.rows.length > 0) {
        await cancelOrderAndRestock(client, id);
        cancelled += 1;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`No se pudo cancelar el pedido abandonado #${id}:`, error.message);
    } finally {
      client.release();
    }
  }

  if (cancelled > 0) {
    console.log(`Pedidos abandonados cancelados: ${cancelled}`);
  }
}

let isRunning = false;

// Se arranca desde server.js (no desde app.js), para que los tests que importan la app no lo lancen.
// runInBackground captura cualquier error: un fallo nunca tira el proceso.
function startAbandonedOrdersJob() {
  setInterval(() => {
    // Si la pasada anterior sigue en marcha, no se solapan
    if (isRunning) {
      return;
    }

    isRunning = true;
    runInBackground(async () => {
      try {
        await cancelAbandonedOrders();
      } finally {
        isRunning = false;
      }
    }, 'job de pedidos abandonados');
  }, INTERVAL_MINUTES * 60 * 1000);
}

module.exports = { startAbandonedOrdersJob, cancelAbandonedOrders };
