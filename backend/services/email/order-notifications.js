const pool = require('../../db');
const { frontendUrl } = require('../../config/env');
const { runInBackground } = require('../../utils/background');
const { sendEmail } = require('./index');
const { orderPaidEmail } = require('./templates/order-paid');
const { NOTIFIED_ORDER_STATUSES, orderStatusEmail } = require('./templates/order-status');

// Emails de pedidos (pagado; enviado y entregado). Se llaman DESPUÉS del COMMIT y no se esperan: hacen sus propias
// consultas en segundo plano (sin alargar la transacción ni sus bloqueos) y, si algo falla,
// el pedido sigue siendo válido y solo queda el error en el log.

function orderUrl(orderId) {
  return `${frontendUrl}/orders/${orderId}`;
}

async function loadOrderForEmail(orderId) {
  const orderResult = await pool.query(
    `SELECT o.id, o.subtotal, o.shipping_cost, o.total,
            o.shipping_name, o.shipping_phone, o.shipping_address,
            o.shipping_city, o.shipping_postal_code,
            u.email, u.full_name
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  );

  return orderResult.rows[0] ?? null;
}

// Lo llama el webhook de Stripe tras el COMMIT que marca el pedido como pagado
function notifyOrderPaid(orderId) {
  runInBackground(async () => {
    const row = await loadOrderForEmail(orderId);
    if (!row) {
      return;
    }

    const itemsResult = await pool.query(
      `SELECT product_name, unit_price, quantity, (unit_price * quantity) AS line_total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );

    const email = orderPaidEmail({
      orderUrl: orderUrl(row.id),
      order: {
        id: row.id,
        subtotal: Number(row.subtotal),
        shippingCost: Number(row.shipping_cost),
        total: Number(row.total),
        items: itemsResult.rows.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          lineTotal: Number(item.line_total),
        })),
        shipping: {
          fullName: row.shipping_name,
          phone: row.shipping_phone,
          address: row.shipping_address,
          city: row.shipping_city,
          postalCode: row.shipping_postal_code,
        },
      },
    });

    await sendEmail({ to: row.email, ...email });
  }, `email de pedido ${orderId} pagado`);
}

// Solo shipped y delivered avisan al cliente
function notifyOrderStatusChanged(orderId, status) {
  if (!NOTIFIED_ORDER_STATUSES.includes(status)) {
    return;
  }

  runInBackground(async () => {
    const row = await loadOrderForEmail(orderId);
    if (!row) {
      return;
    }

    const email = orderStatusEmail({
      orderId: row.id,
      status,
      fullName: row.shipping_name,
      orderUrl: orderUrl(row.id),
    });

    await sendEmail({ to: row.email, ...email });
  }, `email de pedido ${orderId} en estado ${status}`);
}

module.exports = { notifyOrderPaid, notifyOrderStatusChanged };
