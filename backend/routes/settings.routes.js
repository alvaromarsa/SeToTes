const express = require('express');

const pool = require('../db');
const { getStoreSettings } = require('../utils/store-settings');

// Montado en /api/settings. Ajustes públicos de la tienda (sin autenticación): los lee cualquier
// visitante en cada carga de la web. La edición está en /api/admin/settings.
const router = express.Router();

// Caché corta: un cambio del admin tarda como mucho esto en llegar a quien ya los había cargado
const PUBLIC_SETTINGS_MAX_AGE_SECONDS = 60;

router.get('/public', async (request, response) => {
  try {
    const settings = await getStoreSettings(pool);

    response.set('Cache-Control', `public, max-age=${PUBLIC_SETTINGS_MAX_AGE_SECONDS}`);
    return response.json(settings);
  } catch (error) {
    console.error('Error al consultar los ajustes públicos:', error.message);
    // Un error nunca se cachea: la siguiente petición vuelve a intentarlo
    response.set('Cache-Control', 'no-store');
    return response.status(500).json({
      message: 'No se pudieron cargar los ajustes de la tienda',
    });
  }
});

module.exports = router;
