const express = require('express');

const pool = require('../db');
const { ORDER_STATUSES, ORDER_TRANSITIONS } = require('../config/constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { OrderError, formatOrder } = require('../utils/orders');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (request, response) => {
  const { status } = request.query;

  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    return response.status(400).json({
      message: 'El estado no es válido',
    });
  }

  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.total, o.created_at,
              u.full_name AS customer_name, u.email AS customer_email,
              (SELECT COALESCE(SUM(oi.quantity), 0)::integer
               FROM order_items oi
               WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ($1::text IS NULL OR o.status = $1)
       ORDER BY o.created_at DESC, o.id DESC`,
      [status ?? null]
    );

    return response.json(
      result.rows.map((row) => ({
        ...formatOrder(row),
        itemCount: row.item_count,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
      }))
    );
  } catch (error) {
    console.error('Error al consultar los pedidos (admin):', error);
    return response.status(500).json({
      message: 'No se pudieron cargar los pedidos',
    });
  }
});

router.get('/:id', async (request, response) => {
  const orderId = Number(request.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return response.status(400).json({
      message: 'El pedido no es válido',
    });
  }

  try {
    const orderResult = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.total, o.created_at,
              o.shipping_name, o.shipping_phone, o.shipping_address,
              o.shipping_city, o.shipping_postal_code,
              u.full_name AS customer_name, u.email AS customer_email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el pedido',
      });
    }

    const itemsResult = await pool.query(
      `SELECT product_id, product_name, unit_price, quantity,
              (unit_price * quantity) AS line_total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );

    const row = orderResult.rows[0];

    return response.json({
      ...formatOrder(row),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      allowedStatuses: ORDER_TRANSITIONS[row.status],
      shipping: {
        fullName: row.shipping_name,
        phone: row.shipping_phone,
        address: row.shipping_address,
        city: row.shipping_city,
        postalCode: row.shipping_postal_code,
      },
      items: itemsResult.rows.map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
        lineTotal: Number(item.line_total),
      })),
    });
  } catch (error) {
    console.error('Error al consultar el pedido (admin):', error);
    return response.status(500).json({
      message: 'No se pudo cargar el pedido',
    });
  }
});

router.patch('/:id/status', async (request, response) => {
  const orderId = Number(request.params.id);
  const { status } = request.body ?? {};

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0 ||
    !ORDER_STATUSES.includes(status)
  ) {
    return response.status(400).json({
      message: 'Los datos del pedido no son válidos',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (current.rows.length === 0) {
      throw new OrderError(404, 'No se encontró el pedido');
    }

    const currentStatus = current.rows[0].status;

    if (!ORDER_TRANSITIONS[currentStatus].includes(status)) {
      throw new OrderError(
        409,
        `No se puede pasar un pedido de "${currentStatus}" a "${status}"`
      );
    }

    if (status === 'cancelled') {
      await client.query(
        `UPDATE products p
         SET stock = p.stock + oi.quantity
         FROM order_items oi
         WHERE oi.product_id = p.id AND oi.order_id = $1`,
        [orderId]
      );
    }

    const result = await client.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING id, status, subtotal, shipping_cost, total, created_at`,
      [status, orderId]
    );

    await client.query('COMMIT');

    return response.json(formatOrder(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof OrderError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al cambiar el estado del pedido:', error);
    return response.status(500).json({
      message: 'No se pudo cambiar el estado del pedido',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
