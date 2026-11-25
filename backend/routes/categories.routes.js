const express = require('express');

const pool = require('../db');
const { PREVIOUS_SLUGS_COLUMN, formatCategory } = require('../utils/categories');

// Montado en /api/categories. Lista pública (sin autenticación) de las categorías, en su orden,
// cada una con previousSlugs (sus direcciones antiguas, que el frontend redirige a la actual).
// La administración está en /api/admin/categories.
const router = express.Router();

// Caché: no-cache + ETag. El navegador guarda la respuesta, pero la revalida en CADA uso:
// si no ha cambiado, el servidor responde 304 sin cuerpo (Express calcula el ETag de res.json
// y compara If-None-Match por su cuenta). Así una categoría nueva se ve al recargar, sin
// esperar a que caduque una caché con max-age. Los slugs antiguos van en el mismo cuerpo: un
// renombrado cambia la respuesta y, con ella, el ETag.
router.get('/', async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.slug, c.name, c.position, ${PREVIOUS_SLUGS_COLUMN}
       FROM categories c
       ORDER BY c.position, c.id`
    );

    response.set('Cache-Control', 'no-cache');
    return response.json(result.rows.map(formatCategory));
  } catch (error) {
    console.error('Error al consultar las categorías:', error.message);
    // Un error nunca se cachea: la siguiente petición vuelve a intentarlo
    response.set('Cache-Control', 'no-store');
    return response.status(500).json({
      message: 'No se pudieron cargar las categorías',
    });
  }
});

module.exports = router;
