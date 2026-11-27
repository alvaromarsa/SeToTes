const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PREVIOUS_SLUGS_COLUMN, formatCategory, parseCategoryName } = require('../utils/categories');

// Montado en /api/admin/categories: listar con contadores, crear, renombrar y borrar.
// La lista pública está en /api/categories.
//
// Unicidad (migraciones 008 y 009):
// - slug: la URL (/categoria/<slug>) y lo que guarda products.category. Sale del nombre al crear
//   y al renombrar; products.category lo sigue solo (clave ajena ON UPDATE CASCADE).
// - category_slugs: todos los slugs de cada categoría, el actual y los antiguos (el historial).
//   Un slug, actual o antiguo, no lo usa otra categoría mientras exista la suya (clave primaria).
//   Al borrar la categoría, sus slugs se borran con ella (CASCADE) y quedan libres.
// - name_key: el nombre normalizado (slugify), único. Coincide con el slug salvo en categorías
//   renombradas antes de la 009, hasta que se vuelven a guardar.
// Un nombre nuevo choca con otra categoría si su forma normalizada es su nombre (name_key), su
// dirección actual o una antigua suya. En todos los casos, 409 con un mensaje que lo explica.
// name_key es GLOBAL también para las subcategorías (migración 011): las URL son planas y el slug
// sale del nombre, así que dos subcategorías «Grandes» de padres distintos chocarían igualmente.
//
// Subcategorías (migración 011): un solo nivel (parent_id apunta a una categoría de primer nivel).
// Las reglas las garantiza la base de datos (ver la migración); aquí se comprueban antes para dar
// mensajes claros. Mover una subcategoría a otro padre, o convertir una categoría de primer nivel
// en subcategoría (o al revés), no está soportado: el PATCH ignora parentId.
const router = express.Router();

const SUBCATEGORY_DEPTH_MESSAGE = 'Una subcategoría solo puede estar dentro de una categoría de primer nivel';

function productCountText(count) {
  return count === 1 ? '1 producto' : `${count} productos`;
}

// parentId (opcional; null o ausente = primer nivel) y moveProducts (opcional; booleano, solo con
// parentId). Devuelve { parentId, moveProducts } o { error }
function parseParentOptions(body) {
  const rawParentId = body?.parentId ?? null;
  // Solo un número entero positivo (un texto como "5" no vale)
  const parentId = typeof rawParentId === 'number' ? parseCategoryId(rawParentId) : null;

  if (rawParentId !== null && parentId === null) {
    return { error: 'La categoría padre no es válida' };
  }

  const moveProducts = body?.moveProducts ?? false;

  if (typeof moveProducts !== 'boolean') {
    return { error: 'moveProducts debe ser true o false' };
  }

  if (moveProducts && parentId === null) {
    return { error: 'Solo se pueden mover productos al crear una subcategoría' };
  }

  return { parentId, moveProducts };
}

router.use(requireAuth, requireAdmin);

function parseCategoryId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Mensaje del 409: dice con qué categoría choca y por qué (mismo nombre, su dirección actual o una
// dirección antigua suya). parsed: { slug, nameKey } de parseCategoryName
async function conflictMessage(parsed, excludeId) {
  const sameName = await pool.query('SELECT name FROM categories WHERE name_key = $1 AND id <> $2', [
    parsed.nameKey,
    excludeId ?? 0,
  ]);

  if (sameName.rows[0]) {
    return `Ya existe una categoría con ese nombre: «${sameName.rows[0].name}»`;
  }

  const owner = await pool.query(
    `SELECT c.name, c.slug
     FROM category_slugs s
     JOIN categories c ON c.id = s.category_id
     WHERE s.slug = $1 AND c.id <> $2`,
    [parsed.slug, excludeId ?? 0]
  );
  const other = owner.rows[0];

  if (!other) {
    return 'Ya existe una categoría con ese nombre';
  }

  return other.slug === parsed.slug
    ? `Ese nombre corresponde a la dirección /categoria/${parsed.slug}, que ya usa la categoría «${other.name}»`
    : `Ese nombre corresponde a la dirección /categoria/${parsed.slug}, una dirección antigua de la categoría «${other.name}» que sigue llevando a ella`;
}

// Errores de unicidad que se traducen a 409 (también los de dos peticiones simultáneas)
const UNIQUE_CONSTRAINTS = new Set(['categories_slug_key', 'categories_name_key_key', 'category_slugs_pkey']);

function isUniqueViolation(error) {
  return error.code === '23505' && UNIQUE_CONSTRAINTS.has(error.constraint);
}

// Todas las categorías con el número de productos de cada una, contando también los ocultos
// (son los que impiden borrarla), y el de subcategorías (también impiden borrarla). Mismo orden
// que la lista pública. Un padre no tiene productos propios: productCount = 0
router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.slug, c.name, c.position, c.parent_id, ${PREVIOUS_SLUGS_COLUMN},
              (SELECT count(*)::int FROM products p WHERE p.category = c.slug) AS product_count,
              (SELECT count(*)::int FROM categories child WHERE child.parent_id = c.id) AS subcategory_count
       FROM categories c
       ORDER BY c.position, c.id`
    );

    return response.json(
      result.rows.map((row) => ({
        ...formatCategory(row),
        productCount: row.product_count,
        subcategoryCount: row.subcategory_count,
      }))
    );
  } catch (error) {
    console.error('Error al consultar las categorías (admin):', error.message);
    return response.status(500).json({
      message: 'No se pudieron cargar las categorías',
    });
  }
});

// Crear: { name, parentId?, moveProducts? } (cualquier otro campo se ignora). El slug lo genera
// el servidor. La nueva va al final (MAX(position) + 1); dos altas simultáneas de nombres
// distintos podrían empatar, y el listado desempata por id.
// Su slug lo registra en category_slugs el trigger categories_register_slug (migración 009), no
// esta ruta: así lo registra también cualquier otro INSERT (seed.sql, un backend anterior, uno a
// mano). Si el slug es una dirección antigua de otra categoría, el trigger choca con la clave
// primaria (23505 category_slugs_pkey) y el alta entera se deshace → 409.
//
// Subcategoría (parentId, migración 011): el padre tiene que existir y ser de primer nivel (400).
// Si el padre tiene productos (es su primera subcategoría), hay que moverlos a la nueva:
// moveProducts: true los mueve en la MISMA transacción; sin él → 409 con productCount, para que el
// admin lo confirme. El padre se bloquea (FOR UPDATE) antes de contar y mover: nadie le añade un
// producto entre medias. La regla «un padre no tiene productos» la comprueba la base de datos al
// COMMIT (trigger diferido categories_parent_without_products), cuando ya se han movido.
router.post('/', async (request, response) => {
  const parsed = parseCategoryName(request.body?.name);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  const options = parseParentOptions(request.body);

  if (options.error) {
    return response.status(400).json({ message: options.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let parent = null;
    let parentProductCount = 0;

    if (options.parentId !== null) {
      const parentResult = await client.query(
        'SELECT id, slug, name, parent_id FROM categories WHERE id = $1 FOR UPDATE',
        [options.parentId]
      );
      parent = parentResult.rows[0] ?? null;

      if (!parent) {
        await client.query('ROLLBACK');
        return response.status(400).json({ message: 'La categoría padre no existe' });
      }

      if (parent.parent_id !== null) {
        await client.query('ROLLBACK');
        return response.status(400).json({ message: SUBCATEGORY_DEPTH_MESSAGE });
      }

      const count = await client.query('SELECT count(*)::int AS total FROM products WHERE category = $1', [
        parent.slug,
      ]);
      parentProductCount = count.rows[0].total;

      if (parentProductCount > 0 && !options.moveProducts) {
        await client.query('ROLLBACK');
        return response.status(409).json({
          message: `«${parent.name}» tiene ${productCountText(parentProductCount)}. Para crear su primera subcategoría hay que moverlos a ella.`,
          code: 'PARENT_HAS_PRODUCTS',
          productCount: parentProductCount,
        });
      }
    }

    // ON CONFLICT DO NOTHING (sin columna): cubre los dos únicos de categories, slug y name_key.
    // Dos altas a la vez del mismo nombre → una crea y la otra no devuelve fila
    const inserted = await client.query(
      `INSERT INTO categories (slug, name, name_key, position, parent_id)
       SELECT $1, $2, $3, COALESCE(MAX(position), 0) + 1, $4 FROM categories
       ON CONFLICT DO NOTHING
       RETURNING id, slug, name, position, parent_id`,
      [parsed.slug, parsed.name, parsed.nameKey, options.parentId]
    );

    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      return response.status(409).json({ message: await conflictMessage(parsed) });
    }

    const created = inserted.rows[0];
    let movedProductCount = 0;

    if (parent && parentProductCount > 0) {
      // products.category → la subcategoría nueva (también los ocultos)
      const moved = await client.query('UPDATE products SET category = $1 WHERE category = $2', [
        created.slug,
        parent.slug,
      ]);
      movedProductCount = moved.rowCount;
    }

    // Aquí se comprueba la regla diferida (23514 si el padre aún tuviera productos)
    await client.query('COMMIT');

    // Solo slugs y números: el nombre lo ha escrito el admin y no aporta nada al log
    console.log(
      parent
        ? `Subcategoría creada: ${created.slug} (en ${parent.slug}; productos movidos: ${movedProductCount})`
        : `Categoría creada: ${created.slug}`
    );

    // Recién creada: sin direcciones antiguas (previousSlugs vacío)
    return response.status(201).json({ ...formatCategory(created), movedProductCount });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (isUniqueViolation(error)) {
      return response.status(409).json({ message: await conflictMessage(parsed) });
    }

    // El padre se borró o pasó a ser subcategoría entre medias (clave ajena compuesta)
    if (error.code === '23503' && error.constraint === 'categories_parent_fkey') {
      return response.status(400).json({ message: SUBCATEGORY_DEPTH_MESSAGE });
    }

    // Red de seguridad: el padre seguía con productos al COMMIT
    if (error.code === '23514' && error.constraint === 'categories_parent_without_products') {
      return response.status(409).json({
        message: 'La categoría padre tiene productos: vuelve a intentarlo para moverlos a la subcategoría',
        code: 'PARENT_HAS_PRODUCTS',
      });
    }

    console.error('Error al crear la categoría:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear la categoría',
    });
  } finally {
    client.release();
  }
});

// Renombrar: cambia el nombre, su name_key y el slug, que sale del nombre nuevo con las mismas
// reglas que al crear (longitud, caracteres, reservados). Si el slug cambia, el anterior queda en
// category_slugs como dirección antigua (redirige a la nueva) y products.category se actualiza
// solo (ON UPDATE CASCADE). Si no cambia (solo mayúsculas o tildes), el historial no se toca.
// Guardar el mismo nombre también vale: sincroniza el slug de una categoría renombrada antes de
// la 009 (nombre y slug desfasados). Igual para subcategorías; parentId se ignora (no se mueven).
router.patch('/:id', async (request, response) => {
  const categoryId = parseCategoryId(request.params.id);

  if (categoryId === null) {
    return response.status(400).json({ message: 'La categoría no es válida' });
  }

  const parsed = parseCategoryName(request.body?.name);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Bloquea la categoría: dos renombrados de la MISMA categoría van uno detrás de otro
    const current = await client.query('SELECT slug FROM categories WHERE id = $1 FOR UPDATE', [categoryId]);

    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return response.status(404).json({ message: 'No se encontró la categoría' });
    }

    const previousSlug = current.rows[0].slug;

    if (parsed.slug !== previousSlug) {
      // Registra el slug nuevo. Si ya existe (DO NOTHING), solo vale si es de esta misma
      // categoría (vuelve a una dirección suya antigua, que deja de ser antigua). Si es de otra
      // (su dirección actual o una antigua), 409. Dos renombrados de categorías distintas al mismo
      // slug a la vez: el segundo espera al primero en la clave primaria y después ve su fila
      const registered = await client.query(
        `INSERT INTO category_slugs (slug, category_id) VALUES ($1, $2)
         ON CONFLICT (slug) DO NOTHING
         RETURNING slug`,
        [parsed.slug, categoryId]
      );

      if (registered.rows.length === 0) {
        const owner = await client.query('SELECT category_id FROM category_slugs WHERE slug = $1', [parsed.slug]);

        // Sin fila: su categoría se acaba de borrar (caso rarísimo); también 409, y basta reintentar
        if (owner.rows[0]?.category_id !== categoryId) {
          await client.query('ROLLBACK');
          return response.status(409).json({ message: await conflictMessage(parsed, categoryId) });
        }
      }
    }

    // El choque de name_key con otra categoría lo resuelve el UNIQUE (23505 → 409). Cambiar el
    // slug arrastra a products.category (ON UPDATE CASCADE): los productos siguen en su categoría
    const updated = await client.query(
      `UPDATE categories AS c
       SET name = $1, name_key = $2, slug = $3
       WHERE c.id = $4
       RETURNING c.id, c.slug, c.name, c.position, c.parent_id, ${PREVIOUS_SLUGS_COLUMN}`,
      [parsed.name, parsed.nameKey, parsed.slug, categoryId]
    );

    await client.query('COMMIT');

    const slugChange = previousSlug === parsed.slug ? previousSlug : `${previousSlug} → ${parsed.slug}`;
    console.log(`Categoría renombrada: ${slugChange}`);

    return response.json(formatCategory(updated.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (isUniqueViolation(error)) {
      return response.status(409).json({ message: await conflictMessage(parsed, categoryId) });
    }

    console.error('Error al renombrar la categoría:', error.message);
    return response.status(500).json({
      message: 'No se pudo renombrar la categoría',
    });
  } finally {
    client.release();
  }
});

// Borrar: solo una categoría SIN productos (contando también los ocultos) y SIN subcategorías
// (clave ajena categories_parent_fkey, ON DELETE RESTRICT → 23503 → 409). Al borrar la última
// subcategoría, el padre vuelve a ser una categoría normal y admite productos. Sus slugs (el actual y
// los antiguos) se borran con ella (category_slugs ON DELETE CASCADE) y quedan libres para otra
// categoría: sus enlaces antiguos pasan a «Categoría no encontrada». Sin carrera: no se
// cuenta antes; se intenta el DELETE y, si la categoría tiene productos, la clave ajena
// products_category_fkey (ON DELETE RESTRICT) lo impide con un 23503, que se traduce a 409. Así
// también se rechaza si alguien crea un producto en ella justo en ese momento. Los pedidos no se
// ven afectados: guardan el producto, no la categoría. Las posiciones quedan con huecos (el orden
// es position, id). 204 sin cuerpo.
router.delete('/:id', async (request, response) => {
  const categoryId = parseCategoryId(request.params.id);

  if (categoryId === null) {
    return response.status(400).json({ message: 'La categoría no es válida' });
  }

  try {
    const deleted = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING slug', [categoryId]);

    if (deleted.rows.length === 0) {
      return response.status(404).json({ message: 'No se encontró la categoría' });
    }

    console.log(`Categoría borrada: ${deleted.rows[0].slug}`);

    return response.status(204).send();
  } catch (error) {
    if (error.code === '23503' && error.constraint === 'products_category_fkey') {
      // El número solo es para el mensaje: lo que decide es la clave ajena
      const count = await pool.query(
        `SELECT count(p.id)::int AS product_count
         FROM categories c
         JOIN products p ON p.category = c.slug
         WHERE c.id = $1`,
        [categoryId]
      );
      const productCount = count.rows[0]?.product_count ?? 0;
      return response.status(409).json({
        message: `No se puede eliminar: tiene ${productCountText(productCount)}. Muévelos a otra categoría o elimínalos antes.`,
        productCount,
      });
    }

    if (error.code === '23503' && error.constraint === 'categories_parent_fkey') {
      const count = await pool.query('SELECT count(*)::int AS total FROM categories WHERE parent_id = $1', [
        categoryId,
      ]);
      const subcategoryCount = count.rows[0]?.total ?? 0;
      const subcategories = subcategoryCount === 1 ? '1 subcategoría' : `${subcategoryCount} subcategorías`;

      return response.status(409).json({
        message: `No se puede eliminar: tiene ${subcategories}. Elimínalas antes.`,
        subcategoryCount,
      });
    }

    console.error('Error al borrar la categoría:', error.message);
    return response.status(500).json({
      message: 'No se pudo borrar la categoría',
    });
  }
});

module.exports = router;
