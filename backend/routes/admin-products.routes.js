const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PRODUCT_IMAGES_SQL, formatAdminProduct } = require('../utils/products');

// Montado en /api/admin/products. Las rutas públicas (/api/products) solo
// muestran productos visibles; aquí se ven todos, con su estado de publicación.
const router = express.Router();

router.use(requireAuth, requireAdmin);

class ProductVisibilityError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.stock, p.color, p.category, p.is_visible, ${PRODUCT_IMAGES_SQL}
       FROM products p
       ORDER BY p.id`
    );

    return response.json(result.rows.map(formatAdminProduct));
  } catch (error) {
    console.error('Error al consultar los productos (admin):', error.message);
    return response.status(500).json({
      message: 'No se pudieron cargar los productos',
    });
  }
});

router.patch('/:id/visibility', async (request, response) => {
  const productId = Number(request.params.id);
  const { isVisible } = request.body ?? {};

  if (!Number.isInteger(productId) || productId <= 0 || typeof isVisible !== 'boolean') {
    return response.status(400).json({
      message: 'Los datos de visibilidad no son válidos',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Mismo bloqueo que el borrado de imágenes (product-images.routes.js): así no se
    // puede publicar a la vez que otro admin elimina la última imagen
    const locked = await client.query(
      'SELECT id FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (locked.rows.length === 0) {
      throw new ProductVisibilityError(404, 'No se encontró el producto');
    }

    if (isVisible) {
      const images = await client.query(
        'SELECT COUNT(*)::integer AS image_count FROM product_images WHERE product_id = $1',
        [productId]
      );

      if (images.rows[0].image_count === 0) {
        throw new ProductVisibilityError(
          409,
          'No se puede publicar un producto sin imágenes. Añade al menos una imagen antes de publicarlo'
        );
      }
    }

    const result = await client.query(
      `UPDATE products AS p
       SET is_visible = $1
       WHERE p.id = $2
       RETURNING p.id, p.name, p.price, p.stock, p.color, p.category, p.is_visible, ${PRODUCT_IMAGES_SQL}`,
      [isVisible, productId]
    );

    await client.query('COMMIT');

    return response.json(formatAdminProduct(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof ProductVisibilityError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al cambiar la visibilidad del producto:', error);
    return response.status(500).json({
      message: 'No se pudo cambiar la visibilidad del producto',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
