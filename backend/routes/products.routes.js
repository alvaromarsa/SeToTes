const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getProductCategoryStatus, isValidSlug } = require('../utils/categories');
const {
  PRODUCT_IMAGES_SQL,
  formatAdminProduct,
  formatProduct,
  formatProductDetail,
  parseDescription,
} = require('../utils/products');

const router = express.Router();

const CATEGORY_NOT_FOUND_MESSAGE = 'La categoría no existe';
const CATEGORY_HAS_SUBCATEGORIES_MESSAGE = 'Esa categoría tiene subcategorías: elige una de ellas';

// 23503: violación de clave ajena (products_category_fkey)
function isCategoryForeignKeyError(error) {
  return error.code === '23503' && error.constraint === 'products_category_fkey';
}

// 23514 del trigger products_category_leaf (migración 011): categoría con subcategorías
function isCategoryLeafError(error) {
  return error.code === '23514' && error.constraint === 'products_category_leaf';
}

// Mensaje del 400 según getProductCategoryStatus ('' si la categoría vale)
function productCategoryError(status) {
  if (status === 'missing') {
    return CATEGORY_NOT_FOUND_MESSAGE;
  }

  return status === 'has-subcategories' ? CATEGORY_HAS_SUBCATEGORIES_MESSAGE : '';
}

// Orden del listado público (lista blanca: nunca se mete en el SQL lo que envía el cliente).
// Sin ?sort, por id (el orden de siempre). newest: los más recientes primero (migración 010); a
// igual fecha, el id más alto, para que el orden sea estable
const PRODUCT_SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
};
const DEFAULT_PRODUCT_ORDER = 'p.id';

// ?limit: entero de 1 a 24 (la portada pide 4). Sin él, todos, como siempre
const PRODUCT_LIST_MAX_LIMIT = 24;

// Un parámetro repetido (?limit=1&limit=2) llega como array: no es válido
function parseListLimit(value) {
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  const limit = Number(value);
  return limit >= 1 && limit <= PRODUCT_LIST_MAX_LIMIT ? limit : null;
}

// GET /api/products: productos VISIBLES. Parámetros opcionales y combinables:
// - category: formato de slug inválido → 400; una categoría que no existe → [] (como una vacía).
//   Acepta también un slug ANTIGUO (migración 009): devuelve los de la categoría a la que
//   pertenece ahora (una pestaña abierta desde antes de un renombrado sigue viéndolos). Con una
//   categoría que tiene subcategorías (migración 011), los de TODAS sus subcategorías («Ver todo»).
// - sort: solo «newest»; otro valor → 400.
// - limit: de 1 a 24; otro valor → 400.
// Sin parámetros, exactamente como antes: todos los visibles, por id.
router.get('/', async (request, response) => {
  const { category, sort } = request.query;

  if (category !== undefined && !isValidSlug(category)) {
    return response.status(400).json({
      message: 'La categoría no es válida',
    });
  }

  // typeof: un ?sort repetido llega como array (y ['newest'] se convertiría en la clave 'newest')
  if (sort !== undefined && (typeof sort !== 'string' || !Object.hasOwn(PRODUCT_SORTS, sort))) {
    return response.status(400).json({
      message: 'El orden no es válido',
    });
  }

  const limit = request.query.limit === undefined ? undefined : parseListLimit(request.query.limit);

  if (limit === null) {
    return response.status(400).json({
      message: `El límite debe ser un número entre 1 y ${PRODUCT_LIST_MAX_LIMIT}`,
    });
  }

  const params = [];
  let categoryFilter = '';

  if (category !== undefined) {
    params.push(category);
    // La categoría (id) sale de category_slugs (clave primaria: slug actual o antiguo) en una
    // subconsulta que se evalúa UNA vez; COALESCE: si el slug no está en category_slugs (p. ej. un
    // UPDATE manual del slug), se busca en categories. Después, los productos de esa categoría y de
    // sus subcategorías (una categoría con hijas no tiene productos propios), con el índice
    // products_category_idx
    categoryFilter = `AND p.category IN (
                 SELECT c.slug
                 FROM categories c
                 WHERE COALESCE(
                   (SELECT s.category_id FROM category_slugs s WHERE s.slug = $${params.length}),
                   (SELECT c2.id FROM categories c2 WHERE c2.slug = $${params.length})
                 ) IN (c.id, c.parent_id)
               )`;
  }

  let limitClause = '';

  if (limit !== undefined) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const orderBy = sort === undefined ? DEFAULT_PRODUCT_ORDER : PRODUCT_SORTS[sort];

  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.stock, p.color, p.category, ${PRODUCT_IMAGES_SQL}
       FROM products p
       WHERE p.is_visible ${categoryFilter}
       ORDER BY ${orderBy}
       ${limitClause}`,
      params
    );

    response.json(result.rows.map(formatProduct));
  } catch (error) {
    console.error('Error al consultar productos:', error.message);
    response.status(500).json({
      message: 'No se pudieron cargar los productos',
    });
  }
});

router.get('/:id', async (request, response) => {
  const productId = Number(request.params.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({
      message: 'El producto no es válido',
    });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.stock, p.color, p.category, p.description, ${PRODUCT_IMAGES_SQL}
       FROM products p
       WHERE p.id = $1 AND p.is_visible`,
      [productId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    return response.json(formatProductDetail(result.rows[0]));
  } catch (error) {
    console.error('Error al consultar el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo cargar el producto',
    });
  }
});

router.post('/', requireAuth, requireAdmin, async (request, response) => {
  const { name, price, stock, color, category } = request.body ?? {};
  const description = parseDescription(request.body?.description);

  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    !isValidSlug(category) ||
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

  if (description.error) {
    return response.status(400).json({ message: description.error });
  }

  try {
    const categoryError = productCategoryError(await getProductCategoryStatus(pool, category));

    if (categoryError) {
      return response.status(400).json({ message: categoryError });
    }

    const result = await pool.query(
      `INSERT INTO products (name, price, stock, color, category, description, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id, name, price, stock, color, category, description, is_visible`,
      [name.trim(), price, stock, color ?? null, category, description.value]
    );

    // Solo lo usa el admin: formato de administración. Recién creado: oculto y sin imágenes
    return response.status(201).json(formatAdminProduct({ ...result.rows[0], images: [] }));
  } catch (error) {
    // La categoría se borró entre la comprobación y el INSERT (clave ajena)
    if (isCategoryForeignKeyError(error)) {
      return response.status(400).json({ message: CATEGORY_NOT_FOUND_MESSAGE });
    }

    // Alguien creó una subcategoría en esa categoría justo a la vez (trigger, migración 011)
    if (isCategoryLeafError(error)) {
      return response.status(409).json({ message: CATEGORY_HAS_SUBCATEGORIES_MESSAGE });
    }

    console.error('Error al crear el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el producto',
    });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (request, response) => {
  const productId = Number(request.params.id);
  const { name, price, stock, color, category } = request.body ?? {};
  const description = parseDescription(request.body?.description);

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !isValidSlug(category) ||
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

  if (description.error) {
    return response.status(400).json({ message: description.error });
  }

  try {
    const categoryError = productCategoryError(await getProductCategoryStatus(pool, category));

    if (categoryError) {
      return response.status(400).json({ message: categoryError });
    }

    // Si no se envía description, se conserva la que había ($8 = false)
    const result = await pool.query(
      `UPDATE products AS p
       SET name = $1, price = $2, stock = $3, color = $4, category = $5,
           description = CASE WHEN $8::boolean THEN $7 ELSE p.description END
       WHERE p.id = $6
       RETURNING p.id, p.name, p.price, p.stock, p.color, p.category, p.description, p.is_visible, ${PRODUCT_IMAGES_SQL}`,
      [name.trim(), price, stock, color ?? null, category, productId, description.value, description.provided]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    // Solo lo usa el admin: formato de administración (la visibilidad no cambia aquí)
    return response.json(formatAdminProduct(result.rows[0]));
  } catch (error) {
    if (isCategoryForeignKeyError(error)) {
      return response.status(400).json({ message: CATEGORY_NOT_FOUND_MESSAGE });
    }

    // Alguien creó una subcategoría en esa categoría justo a la vez (trigger, migración 011)
    if (isCategoryLeafError(error)) {
      return response.status(409).json({ message: CATEGORY_HAS_SUBCATEGORIES_MESSAGE });
    }

    console.error('Error al actualizar el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo actualizar el producto',
    });
  }
});

module.exports = router;
