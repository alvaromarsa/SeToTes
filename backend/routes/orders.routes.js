const express = require('express');

const pool = require('../db');
const { SHIPPING_COST, TERMS_VERSION } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');
const { createCheckoutSession, isStripeError, retrieveCheckoutSession } = require('../services/payments/stripe');
const { OrderError, formatOrder } = require('../utils/orders');
const { stockLeftText } = require('../utils/products');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (request, response) => {
  const { fullName, phone, address, city, postalCode, acceptTerms } = request.body ?? {};

  // La aceptación se guarda con el pedido: el backend no se fía de la casilla del navegador
  if (acceptTerms !== true) {
    return response.status(400).json({
      message: 'Debes aceptar las condiciones de compra y la política de privacidad',
    });
  }

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
          `No hay stock suficiente de "${line.name}": ${stockLeftText(line.stock)}`
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
         shipping_city, shipping_postal_code,
         terms_accepted_at, terms_version
       )
       VALUES ($1, $2::numeric, $3::numeric, $2::numeric + $3::numeric,
               $4, $5, $6, $7, $8, now(), $9)
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
        TERMS_VERSION,
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

    // Queda 'pending' (stock reservado) hasta que el webhook de Stripe confirme el pago.
    // El email de confirmación se envía entonces, no ahora.
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

// Crea (o reutiliza) la sesión de Stripe Checkout para pagar un pedido pendiente.
// Los importes salen del snapshot del pedido en la BD, nunca del navegador.
router.post('/:id/checkout-session', async (request, response) => {
  const orderId = Number(request.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return response.status(400).json({
      message: 'El pedido no es válido',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // FOR UPDATE: dos clics seguidos se serializan y el segundo reutiliza la sesión del primero.
    // Importes en céntimos enteros calculados en SQL (numeric exacto, sin coma flotante).
    const orderResult = await client.query(
      `SELECT o.id, o.status, o.stripe_checkout_session_id,
              (o.shipping_cost * 100)::integer AS shipping_cents,
              u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1 AND o.user_id = $2
       FOR UPDATE OF o`,
      [orderId, request.authenticatedUserId]
    );

    // Pedido de otro usuario: 404, como si no existiera
    if (orderResult.rows.length === 0) {
      throw new OrderError(404, 'No se encontró el pedido');
    }

    const order = orderResult.rows[0];

    if (order.status !== 'pending') {
      throw new OrderError(409, 'Este pedido ya no está pendiente de pago');
    }

    if (order.stripe_checkout_session_id) {
      const existing = await retrieveCheckoutSession(order.stripe_checkout_session_id);

      if (existing.status === 'open') {
        await client.query('COMMIT');
        return response.json({ url: existing.url });
      }

      // complete: el pago ya se ha hecho y el webhook lo confirmará en breve
      if (existing.status === 'complete') {
        throw new OrderError(409, 'El pago de este pedido ya se está procesando');
      }
      // expired: se crea una sesión nueva
    }

    const itemsResult = await client.query(
      `SELECT product_name, quantity, (unit_price * 100)::integer AS unit_amount_cents
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );

    const session = await createCheckoutSession({
      orderId,
      customerEmail: order.email,
      items: itemsResult.rows,
      shippingCents: order.shipping_cents,
    });

    // Al sustituir la sesión, un evento "expired" de la anterior ya no encuentra el pedido
    await client.query(
      'UPDATE orders SET stripe_checkout_session_id = $1 WHERE id = $2',
      [session.id, orderId]
    );

    await client.query('COMMIT');

    return response.json({ url: session.url });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof OrderError) {
      return response.status(error.status).json({ message: error.message });
    }

    if (isStripeError(error)) {
      // Detalle solo en el log (el SDK no incluye las claves en sus errores)
      console.error(`Error de Stripe al crear la sesión del pedido #${orderId}:`, error.type, error.code ?? '', error.message);
      return response.status(502).json({
        message: 'No se pudo conectar con la pasarela de pago. Inténtalo de nuevo en unos minutos.',
      });
    }

    console.error('Error al crear la sesión de pago:', error.message);
    return response.status(500).json({
      message: 'No se pudo iniciar el pago',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
