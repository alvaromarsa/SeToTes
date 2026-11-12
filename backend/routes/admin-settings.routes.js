const express = require('express');

const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getStoreSettings, parseStoreSettingsInput } = require('../utils/store-settings');

// Montado en /api/admin/settings. Las claves válidas son la lista blanca STORE_SETTINGS
// (config/constants.js); los valores son texto plano de una línea.
const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (request, response) => {
  try {
    return response.json(await getStoreSettings(pool));
  } catch (error) {
    console.error('Error al consultar los ajustes (admin):', error.message);
    return response.status(500).json({
      message: 'No se pudieron cargar los ajustes de la tienda',
    });
  }
});

// Exige todas las claves: el formulario siempre envía el conjunto completo
router.put('/', async (request, response) => {
  const parsed = parseStoreSettingsInput(request.body);

  if (parsed.error) {
    return response.status(400).json({ message: parsed.error });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert: si alguien borró la fila, se vuelve a crear. El admin sale de la cookie, nunca del body
    for (const { key, value } of parsed.values) {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        [key, value, request.authenticatedUserId]
      );
    }

    const settings = await getStoreSettings(client);

    await client.query('COMMIT');

    return response.json(settings);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al guardar los ajustes:', error.message);
    return response.status(500).json({
      message: 'No se pudieron guardar los ajustes de la tienda',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
