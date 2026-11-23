const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { formatCategory, parseCategoryName } = require('../utils/categories');

// Montado en /api/admin/categories. Por ahora solo CREAR (sin borrar, renombrar ni reordenar).
// La lista pública está en /api/categories.
const router = express.Router();

router.use(requireAuth, requireAdmin);

// Solo se lee { name }: el slug lo genera el servidor (cualquier otro campo se ignora).
// Unicidad por slug: "Bolsas", "BOLSÁS" o "bolsas!" chocan con la categoría "bolsas" (409).
// La nueva va al final (MAX(position) + 1). Dos altas simultáneas de nombres distintos podrían
// quedar con la misma posición; no es un problema: el listado desempata por id.
router.post('/', async (request, response) => {
  const parsed = parseCategoryName(request.body?.name);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  try {
    // ON CONFLICT: dos altas a la vez del mismo nombre → una crea y la otra no devuelve fila
    const inserted = await pool.query(
      `INSERT INTO categories (slug, name, position)
       SELECT $1, $2, COALESCE(MAX(position), 0) + 1 FROM categories
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, slug, name, position`,
      [parsed.slug, parsed.name]
    );

    if (inserted.rows.length === 0) {
      const existing = await pool.query('SELECT name FROM categories WHERE slug = $1', [parsed.slug]);
      const existingName = existing.rows[0]?.name;

      return response.status(409).json({
        message: existingName
          ? `Ya existe una categoría con ese nombre: «${existingName}»`
          : 'Ya existe una categoría con ese nombre',
      });
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

module.exports = router;
