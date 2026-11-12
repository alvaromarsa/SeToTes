const { Pool } = require('pg');

const { database } = require('./config/env');

// Configuración ya validada en config/env.js. DATABASE_URL, si existe, tiene prioridad.
const pool = new Pool({
  ...(database.connectionString
    ? { connectionString: database.connectionString }
    : {
        host: database.host,
        port: database.port,
        database: database.name,
        user: database.user,
        password: database.password,
      }),
  ssl: database.ssl,
  max: database.poolMax,
  idleTimeoutMillis: database.idleTimeoutMs,
  connectionTimeoutMillis: database.connectionTimeoutMs,
});

// Error en una conexión inactiva del pool (p. ej. la base de datos reinicia): pg la descarta.
// Sin este manejador, el evento 'error' sin escuchar tumbaría el proceso.
pool.on('error', (error) => {
  console.error('Error en una conexión inactiva de PostgreSQL:', error.message);
});

module.exports = pool;
