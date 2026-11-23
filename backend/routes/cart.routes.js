const express = require('express');

const pool = require('../db');
const { SHIPPING_COST } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');
const storage = require('../storage');
const { stockLeftText } = require('../utils/products');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT p.id AS product_id, p.name, p.color, p.category,
              p.price, p.stock, ci.quantity,
              (p.price * ci.quantity) AS line_total, p.is_visible,
              main_image.file_key AS main_image_key
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       LEFT JOIN LATERAL (
         SELECT pi.file_key
         FROM product_images pi
         WHERE pi.product_id = p.id
         ORDER BY pi.position, pi.id
         LIMIT 1
       ) main_image ON true
       WHERE ci.user_id = $1
       ORDER BY ci.created_at`,
      [request.authenticatedUserId]
    );

    const items = result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      color: row.color,
      category: row.category,
      price: Number(row.price),
      stock: row.stock,
      quantity: row.quantity,
      lineTotal: Number(row.line_total),
      // Un producto ocultado tras añadirlo sigue en el carrito, pero no se puede pedir
      isAvailable: row.is_visible,
      mainImage: row.main_image_key
        ? { cardUrl: storage.publicUrl(row.main_image_key, 'card') }
        : null,
    }));

    const total = Math.round(
      items.reduce((sum, item) => sum + item.lineTotal, 0) * 100
    ) / 100;

    return response.json({ items, total, shippingCost: SHIPPING_COST });
  } catch (error) {
    console.error('Error al consultar el carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo cargar el carrito',
    });
  }
});

router.post('/items', async (request, response) => {
  const { productId, quantity } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 99
  ) {
    return response.status(400).json({
      message: 'Los datos del carrito no son válidos',
    });
  }

  try {
    const check = await pool.query(
      `SELECT p.stock, COALESCE(ci.quantity, 0) AS in_cart
       FROM products p
       LEFT JOIN cart_items ci
         ON ci.product_id = p.id AND ci.user_id = $2
       WHERE p.id = $1 AND p.is_visible`,
      [productId, request.authenticatedUserId]
    );

    if (check.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    const { stock, in_cart } = check.rows[0];

    if (in_cart + quantity > stock) {
      return response.status(409).json({
        message: `No hay stock suficiente: ${stockLeftText(stock)}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity,
                     updated_at = now()
       RETURNING product_id, quantity`,
      [request.authenticatedUserId, productId, quantity]
    );

    return response.status(201).json({
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
    });
  } catch (error) {
    console.error('Error al añadir al carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo añadir el producto al carrito',
    });
  }
});

router.patch('/items/:productId', async (request, response) => {
  const productId = Number(request.params.productId);
  const { quantity } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 99
  ) {
    return response.status(400).json({
      message: 'Los datos del carrito no son válidos',
    });
  }

  try {
    const product = await pool.query(
      `SELECT p.stock, p.is_visible, ci.quantity AS in_cart
       FROM products p
       LEFT JOIN cart_items ci
         ON ci.product_id = p.id AND ci.user_id = $2
       WHERE p.id = $1`,
      [productId, request.authenticatedUserId]
    );

    if (product.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    const { stock, is_visible, in_cart } = product.rows[0];

    // Una línea de un producto oculto solo puede bajar de cantidad o quitarse
    if (!is_visible && in_cart !== null && quantity > in_cart) {
      return response.status(409).json({
        message: 'Este producto ya no está disponible: puedes quitarlo, pero no añadir más unidades',
      });
    }

    // Bajar la cantidad siempre se permite, aunque siga por encima del stock (el admin pudo
    // bajarlo después de añadir el producto): si no, el usuario no podría salir de ahí.
    // Subir (o dejarla igual) sigue limitado por el stock
    const isDecrease = in_cart !== null && quantity < in_cart;

    if (!isDecrease && quantity > stock) {
      return response.status(409).json({
        message: `No hay stock suficiente: ${stockLeftText(stock)}`,
      });
    }

    const result = await pool.query(
      `UPDATE cart_items
       SET quantity = $1, updated_at = now()
       WHERE user_id = $2 AND product_id = $3
       RETURNING product_id, quantity`,
      [quantity, request.authenticatedUserId, productId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'Ese producto no está en tu carrito',
      });
    }

    return response.json({
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
    });
  } catch (error) {
    console.error('Error al cambiar la cantidad:', error.message);
    return response.status(500).json({
      message: 'No se pudo cambiar la cantidad',
    });
  }
});

router.delete('/items/:productId', async (request, response) => {
  const productId = Number(request.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({
      message: 'El producto no es válido',
    });
  }

  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [request.authenticatedUserId, productId]
    );

    if (result.rowCount === 0) {
      return response.status(404).json({
        message: 'Ese producto no está en tu carrito',
      });
    }

    return response.status(204).send();
  } catch (error) {
    console.error('Error al quitar del carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo quitar el producto del carrito',
    });
  }
});

module.exports = router;
