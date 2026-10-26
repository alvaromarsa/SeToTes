const express = require('express');

const pool = require('../db');
const { CATEGORIES } = require('../config/constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (request, response) => {
  const { category } = request.query;

  if (category !== undefined && !CATEGORIES.includes(category)) {
    return response.status(400).json({
      message: 'La categoría no es válida',
    });
  }

  try {
    const result =
      category === undefined
        ? await pool.query(
            'SELECT id, name, price, stock, color, category FROM products ORDER BY id'
          )
        : await pool.query(
            `SELECT id, name, price, stock, color, category
             FROM products
             WHERE category = $1
             ORDER BY id`,
            [category]
          );

    response.json(result.rows);
  } catch (error) {
    console.error('Error al consultar productos:', error.message);
    response.status(500).json({
      message: 'No se pudieron cargar los productos',
    });
  }
});

router.post('/', requireAuth, requireAdmin, async (request, response) => {
  const { name, price, stock, color, category } = request.body ?? {};

  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    !CATEGORIES.includes(category) ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (color !== undefined && color !== null && typeof color !== 'string')
  ) {
    return response.status(400).json({
      message: 'Los datos del producto no son válidos',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, stock, color, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, price, stock, color, category`,
      [name.trim(), price, stock, color ?? null, category]
    );

    return response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el producto',
    });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (request, response) => {
  const productId = Number(request.params.id);
  const { name, price, stock, color, category } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !CATEGORIES.includes(category) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (color !== undefined && color !== null && typeof color !== 'string')
  ) {
    return response.status(400).json({
      message: 'Los datos del producto no son válidos',
    });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, price = $2, stock = $3, color = $4, category = $5
       WHERE id = $6
       RETURNING id, name, price, stock, color, category`,
      [name.trim(), price, stock, color ?? null, category, productId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    return response.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo actualizar el producto',
    });
  }
});

module.exports = router;
