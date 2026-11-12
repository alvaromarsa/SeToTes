const app = require('./app');
const pool = require('./db');
const { shutdownTimeoutMs } = require('./config/env');
const { startAbandonedOrdersJob } = require('./jobs/cancel-abandoned-orders');

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Backend disponible en http://localhost:${port}`);
});

// Tareas periódicas: solo al arrancar el servidor, nunca al importar app.js
const abandonedOrdersTimer = startAbandonedOrdersJob();

let isShuttingDown = false;

// Cierre ordenado: parar el job, no aceptar conexiones nuevas, esperar a las peticiones en
// curso (como máximo shutdownTimeoutMs) y cerrar el pool de PostgreSQL. Una segunda señal
// mientras se cierra no lo repite.
function shutdown(reason, exitCode) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`Cerrando el servidor (${reason})…`);
  clearInterval(abandonedOrdersTimer);

  // Si las peticiones en curso no terminan a tiempo, se cortan. unref: este temporizador no
  // mantiene vivo el proceso si todo termina antes
  const forceExitTimer = setTimeout(() => {
    console.error(`Las peticiones en curso no terminaron en ${shutdownTimeoutMs} ms: se cierran a la fuerza`);
    server.closeAllConnections();
    process.exit(exitCode || 1);
  }, shutdownTimeoutMs);
  forceExitTimer.unref();

  // Una conexión keep-alive sigue abierta tras terminar su petición y server.close() no
  // acabaría nunca: mientras se cierra, las conexiones que quedan inactivas se cierran enseguida
  const idleSweepTimer = setInterval(() => server.closeIdleConnections(), 100);
  idleSweepTimer.unref();

  server.close(async (closeError) => {
    clearInterval(idleSweepTimer);

    if (closeError) {
      console.error('Error al cerrar el servidor HTTP:', closeError.message);
    }

    try {
      await pool.end();
    } catch (error) {
      console.error('Error al cerrar el pool de PostgreSQL:', error.message);
    }

    console.log('Servidor cerrado');
    process.exit(exitCode);
  });
}

// SIGTERM: lo envía la plataforma al desplegar o escalar. SIGINT: Ctrl+C en local
process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// Tras un error no capturado el proceso queda en un estado incierto: se registra y se cierra
// de forma ordenada con código 1 (la plataforma lo vuelve a arrancar)
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin capturar:', reason);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada:', error);
  shutdown('uncaughtException', 1);
});
