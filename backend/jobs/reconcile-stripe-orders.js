const pool = require('../db');
const { reconcile } = require('../config/env');
const { RECONCILE_BATCH_SIZE, RECONCILE_EXPIRY_GRACE_MINUTES } = require('../config/constants');
const { notifyOrderPaid } = require('../services/email/order-notifications');
const { cancelExpiredOrder, markOrderPaidFromSession } = require('../services/payments/order-payments');
const { expireCheckoutSession, retrieveCheckoutSession } = require('../services/payments/stripe');
const { startPeriodicJob } = require('../utils/periodic-job');

// Reconciliación con Stripe: cubre los avisos (webhooks) perdidos. Revisa los pedidos 'pending'
// CON sesión de Stripe y aplica lo que diría el webhook, con la MISMA lógica compartida
// (services/payments/order-payments.js): mismas comprobaciones de importe y moneda.
//
// Stripe se consulta FUERA de la transacción: una llamada puede tardar hasta 15 s y no debe
// tener bloqueada la fila del pedido ni una conexión del pool. Después, con la fila bloqueada
// (FOR UPDATE), se vuelve a comprobar que el pedido sigue 'pending' y con la misma sesión. Si
// el webhook llega a la vez, uno espera al otro y el segundo encuentra el pedido ya resuelto.

const RESULT = { PAID: 'paid', CANCELLED: 'cancelled', UNCHANGED: 'unchanged' };

// Aplica action con el pedido bloqueado, solo si sigue 'pending' con la misma sesión que se
// consultó en Stripe. El email de pagado sale tras el COMMIT y solo si el pedido cambió.
async function withLockedPendingOrder(orderId, sessionId, action) {
  const client = await pool.connect();
  let result = RESULT.UNCHANGED;

  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `SELECT id
       FROM orders
       WHERE id = $1 AND status = 'pending' AND stripe_checkout_session_id = $2
       FOR UPDATE`,
      [orderId, sessionId]
    );

    // Ya lo resolvió el webhook, el admin lo canceló o el cliente abrió otra sesión
    if (locked.rows.length > 0) {
      result = await action(client);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (result === RESULT.PAID) {
    notifyOrderPaid(orderId);
  }

  return result;
}

async function reconcileOrder(orderId, sessionId) {
  let session = await retrieveCheckoutSession(sessionId);

  if (session.status === 'open') {
    const overdueSeconds = Math.floor(Date.now() / 1000) - session.expires_at;

    // Abierta y dentro de plazo (el cliente puede estar pagando): nada que hacer
    if (overdueSeconds < RECONCILE_EXPIRY_GRACE_MINUTES * 60) {
      return RESULT.UNCHANGED;
    }

    // Debería haber caducado hace rato: se expira en Stripe para que ya no se pueda pagar.
    // Si falla (p. ej. el cliente acaba de pagar), el error sube y la siguiente pasada la
    // encontrará 'complete'.
    session = await expireCheckoutSession(sessionId);
  }

  if (session.status === 'complete') {
    // Solo se admite tarjeta (cobro inmediato): completa sin pagar no debería ocurrir
    if (session.payment_status !== 'paid') {
      console.error(`Reconciliación: la sesión del pedido #${orderId} está completa pero sin pagar; revisar en Stripe`);
      return RESULT.UNCHANGED;
    }

    return withLockedPendingOrder(orderId, sessionId, async (client) => {
      const { transitioned } = await markOrderPaidFromSession(client, session);
      return transitioned ? RESULT.PAID : RESULT.UNCHANGED;
    });
  }

  if (session.status === 'expired') {
    return withLockedPendingOrder(orderId, sessionId, async (client) => {
      const { cancelled } = await cancelExpiredOrder(client, session);
      return cancelled ? RESULT.CANCELLED : RESULT.UNCHANGED;
    });
  }

  return RESULT.UNCHANGED;
}

async function reconcileStripeOrders() {
  const candidates = await pool.query(
    `SELECT id, stripe_checkout_session_id
     FROM orders
     WHERE status = 'pending'
       AND stripe_checkout_session_id IS NOT NULL
       AND created_at < now() - make_interval(mins => $1)
     ORDER BY created_at, id
     LIMIT $2`,
    [reconcile.minAgeMinutes, RECONCILE_BATCH_SIZE]
  );

  const summary = { reviewed: 0, paid: 0, cancelled: 0, errors: 0 };

  // Un pedido por vez y cada uno por su cuenta: un fallo con uno no frena a los demás
  for (const { id, stripe_checkout_session_id: sessionId } of candidates.rows) {
    summary.reviewed += 1;

    try {
      const result = await reconcileOrder(id, sessionId);

      if (result === RESULT.PAID) {
        summary.paid += 1;
      } else if (result === RESULT.CANCELLED) {
        summary.cancelled += 1;
      }
    } catch (error) {
      summary.errors += 1;
      // Solo el nº de pedido y el tipo de error: ni ids de pago ni datos personales
      console.error(`Reconciliación: no se pudo revisar el pedido #${id}:`, error.type ?? '', error.message);
    }
  }

  if (summary.reviewed > 0) {
    console.log(
      `Reconciliación con Stripe: ${summary.reviewed} revisados, ${summary.paid} pagados, ` +
        `${summary.cancelled} cancelados, ${summary.errors} errores`
    );
  }

  return summary;
}

// Se arranca desde server.js (no desde app.js), para que los tests que importan la app no lo lancen.
function startReconcileJob() {
  return startPeriodicJob({
    name: 'reconciliación con Stripe',
    intervalMinutes: reconcile.intervalMinutes,
    task: reconcileStripeOrders,
  });
}

module.exports = { startReconcileJob, reconcileStripeOrders };
