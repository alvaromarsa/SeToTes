const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { formatCategory, parseCategoryName } = require('../utils/categories');

// Montado en /api/admin/categories: listar con contadores, crear y renombrar.
// La lista pública está en /api/categories.
//
// Dos columnas únicas (migración 008):
// - slug: la URL (/categoria/<slug>) y lo que guarda products.category. Se fija al crear y NUNCA
//   cambia (ni al renombrar).
// - name_key: el nombre normalizado (slugify). Al crear coincide con el slug; al renombrar cambia.
// Un nombre nuevo choca con otra categoría si su forma normalizada coincide con su name_key (dos
// nombres "iguales": «Gorras», «GORRAS», «gorras!») o con su slug (su URL). En los dos casos, 409.
const router = express.Router();

router.use(requireAuth, requireAdmin);

function parseCategoryId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Mensaje del 409: dice con qué categoría choca y por qué (mismo nombre o su dirección web)
async function conflictMessage(nameKey, excludeId) {
  const result = await pool.query(
    `SELECT name, slug, name_key
     FROM categories
     WHERE (name_key = $1 OR slug = $1) AND id <> $2
     ORDER BY (name_key = $1) DESC
     LIMIT 1`,
    [nameKey, excludeId ?? 0]
  );
  const other = result.rows[0];

  if (!other) {
    return 'Ya existe una categoría con ese nombre';
  }

  return other.name_key === nameKey
    ? `Ya existe una categoría con ese nombre: «${other.name}»`
    : `Ese nombre corresponde a la dirección /categoria/${other.slug}, que ya usa la categoría «${other.name}»`;
}

// Todas las categorías con el número de productos de cada una, contando también los ocultos
// (son los que impiden borrarla). Mismo orden que la lista pública
router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.slug, c.name, c.position, count(p.id)::int AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category = c.slug
       GROUP BY c.id
       ORDER BY c.position, c.id`
    );

    return response.json(
      result.rows.map((row) => ({ ...formatCategory(row), productCount: row.product_count }))
    );
  } catch (error) {
    console.error('Error al consultar las categorías (admin):', error.message);
    return response.status(500).json({
      message: 'No se pudieron cargar las categorías',
    });
  }
});

// Solo se lee { name }: el slug lo genera el servidor (cualquier otro campo se ignora).
// La nueva va al final (MAX(position) + 1). Dos altas simultáneas de nombres distintos podrían
// quedar con la misma posición; no es un problema: el listado desempata por id.
router.post('/', async (request, response) => {
  const parsed = parseCategoryName(request.body?.name);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  try {
    // ON CONFLICT DO NOTHING (sin columna): cubre los dos únicos, slug y name_key. Dos altas a la
    // vez del mismo nombre → una crea y la otra no devuelve fila
    const inserted = await pool.query(
      `INSERT INTO categories (slug, name, name_key, position)
       SELECT $1, $2, $3, COALESCE(MAX(position), 0) + 1 FROM categories
       ON CONFLICT DO NOTHING
       RETURNING id, slug, name, position`,
      [parsed.slug, parsed.name, parsed.nameKey]
    );

    if (inserted.rows.length === 0) {
      return response.status(409).json({ message: await conflictMessage(parsed.nameKey) });
    }

    // Solo el slug: el nombre lo ha escrito el admin y no aporta nada al log
    console.log(`Categoría creada: ${inserted.rows[0].slug}`);

    return response.status(201).json(formatCategory(inserted.rows[0]));
  } catch (error) {
    console.error('Error al crear la categoría:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear la categoría',
    });
  }
});

// Renombrar: SOLO cambia el nombre (y su name_key). El slug no cambia nunca: lo usan la clave
// ajena de products y las URL. Mismas reglas que al crear (longitud, caracteres, reservados).
// Cambiar mayúsculas o tildes de la propia categoría vale (su propio name_key/slug no cuenta).
router.patch('/:id', async (request, response) => {
  const categoryId = parseCategoryId(request.params.id);

  if (categoryId === null) {
    return response.status(400).json({ message: 'La categoría no es válida' });
  }

  const parsed = parseCategoryName(request.body?.name);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  try {
    // Choque con el slug (la URL) de OTRA categoría: se comprueba en la misma sentencia. El choque
    // con el name_key de otra lo resuelve el UNIQUE (23505), también con dos renombrados a la vez
    const updated = await pool.query(
      `UPDATE categories AS c
       SET name = $1, name_key = $2
       WHERE c.id = $3
         AND NOT EXISTS (SELECT 1 FROM categories o WHERE o.slug = $2 AND o.id <> $3)
       RETURNING c.id, c.slug, c.name, c.position`,
      [parsed.name, parsed.nameKey, categoryId]
    );

    if (updated.rows.length === 0) {
      const exists = await pool.query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);

      if (exists.rows.length === 0) {
        return response.status(404).json({ message: 'No se encontró la categoría' });
      }

      return response.status(409).json({ message: await conflictMessage(parsed.nameKey, categoryId) });
    }

    console.log(`Categoría renombrada: ${updated.rows[0].slug}`);

    return response.json(formatCategory(updated.rows[0]));
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'categories_name_key_key') {
      return response.status(409).json({ message: await conflictMessage(parsed.nameKey, categoryId) });
    }

    console.error('Error al renombrar la categoría:', error.message);
    return response.status(500).json({
      message: 'No se pudo renombrar la categoría',
    });
  }
});

module.exports = router;
