const express = require('express');

const pool = require('../db');

// Healthcheck para la plataforma de despliegue: sin autenticación y sin datos internos
// (ni versiones, ni variables, ni el error concreto). Solo dice si la BD responde.
const router = express.Router();

const HEALTH_TIMEOUT_MS = 2000;

router.get('/', async (request, response) => {
  // Nunca se cachea: cada consulta debe reflejar el estado real
  response.set('Cache-Control', 'no-store');

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('La base de datos no respondió a tiempo')), HEALTH_TIMEOUT_MS);
  });

  try {
    // Promise.race deja escuchada también la promesa perdedora: si la consulta falla tarde,
    // no queda una promesa rechazada sin capturar
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return response.json({ status: 'ok' });
  } catch (error) {
    console.error('Healthcheck: la base de datos no responde:', error.message);
    return response.status(503).json({ status: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
