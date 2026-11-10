const express = require('express');

const pool = require('../db');
const { SHIPPING_COST } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');
const { OrderError, formatOrder } = require('../utils/orders');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (request, response) => {
  const { fullName, phone, address, city, postalCode } = request.body ?? {};

  if (
    typeof fullName !== 'string' ||
    fullName.trim() === '' ||
    typeof phone !== 'string' ||
    phone.trim() === '' ||
    typeof address !== 'string' ||
    address.trim() === '' ||
    typeof city !== 'string' ||
    city.trim() === '' ||
    typeof postalCode !== 'string' ||
    !/^\d{5}$/.test(postalCode.trim())
  ) {
    return response.status(400).json({
      message: 'Los datos de envío no son válidos',
    });
  }

  const userId = request.authenticatedUserId;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lines = await client.query(
      `SELECT p.name, ci.quantity, p.stock, p.is_visible
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1
       ORDER BY p.id
       FOR UPDATE OF ci, p`,
      [userId]
    );

    if (lines.rows.length === 0) {
      throw new OrderError(400, 'Tu carrito está vacío');
    }

    // Las filas ya están bloqueadas: ningún admin puede ocultar el producto a mitad del pedido
    const hiddenLine = lines.rows.find((line) => !line.is_visible);
    if (hiddenLine) {
      throw new OrderError(
        409,
        `"${hiddenLine.name}" ya no está disponible. Quítalo del carrito para continuar`
      );
    }

    for (const line of lines.rows) {
      if (line.quantity > line.stock) {
        throw new OrderError(
          409,
          `No hay stock suficiente de "${line.name}": quedan ${line.stock} unidades`
        );
      }
    }

    const subtotalResult = await client.query(
      `SELECT SUM(p.price * ci.quantity) AS subtotal
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [userId]
    );
    const subtotal = subtotalResult.rows[0].subtotal;

    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, subtotal, shipping_cost, total,
         shipping_name, shipping_phone, shipping_address,
         shipping_city, shipping_postal_code
       )
       VALUES ($1, $2::numeric, $3::numeric, $2::numeric + $3::numeric,
               $4, $5, $6, $7, $8)
       RETURNING id, status, subtotal, shipping_cost, total, created_at`,
      [
        userId,
        subtotal,
        SHIPPING_COST,
        fullName.trim(),
        phone.trim(),
        address.trim(),
        city.trim(),
        postalCode.trim(),
      ]
    );
    const order = orderResult.rows[0];

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
       SELECT $1::integer, ci.product_id, p.name, p.price, ci.quantity
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $2`,
      [order.id, userId]
    );

    await client.query(
      `UPDATE products p
       SET stock = p.stock - ci.quantity
       FROM cart_items ci
       WHERE ci.product_id = p.id AND ci.user_id = $1`,
      [userId]
    );

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    return response.status(201).json(formatOrder(order));
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof OrderError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al crear el pedido:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el pedido',
    });
  } finally {
    client.release();
  }
});

router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.total, o.created_at,
              (SELECT COALESCE(SUM(oi.quantity), 0)::integer
               FROM order_items oi
               WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC, o.id DESC`,
      [request.authenticatedUserId]
    );

    return response.json(
      result.rows.map((row) => ({
        ...formatOrder(row),
        itemCount: row.item_count,
      }))
    );
  } catch (error) {
    console.error('Error al consultar los pedidos:', error);
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
      `SELECT id, status, subtotal, shipping_cost, total, created_at,
              shipping_name, shipping_phone, shipping_address,
              shipping_city, shipping_postal_code
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, request.authenticatedUserId]
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
    console.error('Error al consultar el pedido:', error);
    return response.status(500).json({
      message: 'No se pudo cargar el pedido',
    });
  }
});

module.exports = router;
