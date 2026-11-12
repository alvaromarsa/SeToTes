const crypto = require('node:crypto');
const express = require('express');

const pool = require('../db');
const storage = require('../storage');
const { StorageError } = require('../storage/errors');
const { MAX_PRODUCT_IMAGES } = require('../config/constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');
const { ImageError, processProductImage } = require('../utils/images');
const { formatImage } = require('../utils/products');

// Montado en /api/products/:productId/images.
// TODO: no existe borrado de productos; si se añade, borrar también los
// archivos de sus imágenes (ver backend/storage/index.js).
const router = express.Router({ mergeParams: true });

// Antes de multer: no se recibe ni procesa nada de quien no es admin
router.use(requireAuth, requireAdmin);

class ProductImageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function tooManyImagesMessage(currentCount) {
  return `Un producto admite como máximo ${MAX_PRODUCT_IMAGES} imágenes y este ya tiene ${currentCount}`;
}

async function selectImages(db, productId) {
  const result = await db.query(
    `SELECT id, file_key AS "fileKey"
     FROM product_images
     WHERE product_id = $1
     ORDER BY position, id`,
    [productId]
  );

  return result.rows.map(formatImage);
}

// Bloquea la fila del producto: serializa las operaciones sobre sus imágenes
// y con el cambio de visibilidad (admin-products.routes.js)
async function lockProduct(client, productId) {
  const result = await client.query(
    'SELECT id, is_visible FROM products WHERE id = $1 FOR UPDATE',
    [productId]
  );

  if (result.rows.length === 0) {
    throw new ProductImageError(404, 'No se encontró el producto');
  }

  return result.rows[0];
}

router.post('/', uploadProductImages, async (request, response) => {
  const productId = parseId(request.params.productId);
  const files = request.files ?? [];

  if (productId === null) {
    return response.status(400).json({ message: 'El producto no es válido' });
  }

  if (files.length === 0) {
    return response.status(400).json({ message: 'Selecciona al menos una imagen' });
  }

  const savedKeys = [];
  let client;
  let committed = false;

  try {
    // Comprobación rápida antes de gastar CPU procesando imágenes;
    // la definitiva se repite dentro de la transacción
    const check = await pool.query(
      `SELECT (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id)::integer AS image_count
       FROM products p
       WHERE p.id = $1`,
      [productId]
    );

    if (check.rows.length === 0) {
      throw new ProductImageError(404, 'No se encontró el producto');
    }

    if (check.rows[0].image_count + files.length > MAX_PRODUCT_IMAGES) {
      throw new ProductImageError(409, tooManyImagesMessage(check.rows[0].image_count));
    }

    // Se procesan todas antes de escribir: si una no es válida, no se guarda ninguna
    const processed = [];
    for (const file of files) {
      processed.push(await processProductImage(file.buffer));
    }

    for (const variants of processed) {
      const key = crypto.randomUUID();
      savedKeys.push(key);
      await storage.save(key, 'large', variants.large);
      await storage.save(key, 'card', variants.card);
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await lockProduct(client, productId);

    const countResult = await client.query(
      'SELECT COUNT(*)::integer AS image_count FROM product_images WHERE product_id = $1',
      [productId]
    );
    const currentCount = countResult.rows[0].image_count;

    if (currentCount + savedKeys.length > MAX_PRODUCT_IMAGES) {
      throw new ProductImageError(409, tooManyImagesMessage(currentCount));
    }

    // Las nuevas van detrás de las existentes, en el orden en que llegaron
    const inserted = await client.query(
      `INSERT INTO product_images (product_id, file_key, position)
       SELECT $1, t.file_key, $3 + t.ord - 1
       FROM unnest($2::text[]) WITH ORDINALITY AS t(file_key, ord)
       RETURNING id, file_key AS "fileKey", position`,
      [productId, savedKeys, currentCount]
    );

    await client.query('COMMIT');
    committed = true;

    const created = inserted.rows
      .sort((a, b) => a.position - b.position)
      .map(formatImage);

    return response.status(201).json(created);
  } catch (error) {
    if (client && !committed) {
      await client.query('ROLLBACK');
    }

    // Orden: primero el almacenamiento y después la BD. Si algo falla antes del COMMIT, lo ya
    // subido se borra (mejor esfuerzo): un fallo al limpiar se registra pero NO sustituye al
    // error original, que es el que se responde
    await Promise.all(
      (committed ? [] : savedKeys).map((key) =>
        storage.remove(key).catch((removeError) => {
          console.error('No se pudo borrar una imagen huérfana:', removeError.message);
        })
      )
    );

    if (error instanceof ProductImageError || error instanceof ImageError) {
      return response.status(error.status).json({ message: error.message });
    }

    // Almacenamiento caído o rechazando la subida: no es culpa del cliente ni de la API
    if (error instanceof StorageError) {
      console.error('Error del almacenamiento al subir las imágenes:', error.message, error.cause?.name ?? '', error.cause?.message ?? '');
      return response.status(502).json({
        message: 'No se pudieron guardar las imágenes. Inténtalo de nuevo en unos minutos.',
      });
    }

    console.error('Error al subir las imágenes:', error);
    return response.status(500).json({
      message: 'No se pudieron subir las imágenes',
    });
  } finally {
    client?.release();
  }
});

router.put('/order', async (request, response) => {
  const productId = parseId(request.params.productId);
  const { imageIds } = request.body ?? {};

  if (
    productId === null ||
    !Array.isArray(imageIds) ||
    imageIds.length > MAX_PRODUCT_IMAGES ||
    !imageIds.every((id) => Number.isInteger(id) && id > 0) ||
    new Set(imageIds).size !== imageIds.length
  ) {
    return response.status(400).json({
      message: 'El orden de las imágenes no es válido',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await lockProduct(client, productId);

    const current = await client.query(
      'SELECT id FROM product_images WHERE product_id = $1',
      [productId]
    );
    const currentIds = new Set(current.rows.map((row) => row.id));

    if (
      currentIds.size !== imageIds.length ||
      !imageIds.every((id) => currentIds.has(id))
    ) {
      throw new ProductImageError(
        400,
        'Debes enviar todas las imágenes del producto, sin repetir ninguna'
      );
    }

    await client.query(
      `UPDATE product_images pi
       SET position = t.ord - 1
       FROM unnest($1::integer[]) WITH ORDINALITY AS t(id, ord)
       WHERE pi.id = t.id AND pi.product_id = $2`,
      [imageIds, productId]
    );

    const images = await selectImages(client, productId);

    await client.query('COMMIT');

    return response.json(images);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof ProductImageError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al ordenar las imágenes:', error);
    return response.status(500).json({
      message: 'No se pudo guardar el orden de las imágenes',
    });
  } finally {
    client.release();
  }
});

router.delete('/:imageId', async (request, response) => {
  const productId = parseId(request.params.productId);
  const imageId = parseId(request.params.imageId);

  if (productId === null || imageId === null) {
    return response.status(400).json({
      message: 'La imagen no es válida',
    });
  }

  const client = await pool.connect();
  let deletedKey;
  let images;

  try {
    await client.query('BEGIN');
    const product = await lockProduct(client, productId);

    // Filtrar por product_id impide borrar la imagen de otro producto
    const deleted = await client.query(
      `DELETE FROM product_images
       WHERE id = $1 AND product_id = $2
       RETURNING file_key`,
      [imageId, productId]
    );

    if (deleted.rows.length === 0) {
      throw new ProductImageError(404, 'No se encontró la imagen');
    }

    deletedKey = deleted.rows[0].file_key;

    if (product.is_visible) {
      const remaining = await client.query(
        'SELECT COUNT(*)::integer AS image_count FROM product_images WHERE product_id = $1',
        [productId]
      );

      // El ROLLBACK del catch deshace el DELETE
      if (remaining.rows[0].image_count === 0) {
        throw new ProductImageError(
          409,
          'Un producto visible necesita al menos una imagen; ocúltalo antes de eliminarla'
        );
      }
    }

    // Recompacta las posiciones: 0, 1, 2… sin huecos
    await client.query(
      `UPDATE product_images pi
       SET position = r.new_position
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS new_position
         FROM product_images
         WHERE product_id = $1
       ) r
       WHERE pi.id = r.id`,
      [productId]
    );

    images = await selectImages(client, productId);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof ProductImageError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al eliminar la imagen:', error);
    return response.status(500).json({
      message: 'No se pudo eliminar la imagen',
    });
  } finally {
    client.release();
  }

  // Orden: primero la BD y después el almacenamiento (mejor esfuerzo, tras el COMMIT). Un
  // ROLLBACK nunca deja filas sin archivo, y si falla el borrado la imagen ya no existe para la
  // tienda: solo queda un objeto huérfano, que es preferible a una imagen rota.
  try {
    await storage.remove(deletedKey);
  } catch (error) {
    console.error('No se pudieron borrar los archivos de la imagen:', error.message);
  }

  return response.json(images);
});

module.exports = router;
