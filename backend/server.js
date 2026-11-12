const app = require('./app');
const pool = require('./db');
const { shutdownTimeoutMs } = require('./config/env');
const { startAbandonedOrdersJob } = require('./jobs/cancel-abandoned-orders');
const { startReconcileJob } = require('./jobs/reconcile-stripe-orders');

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Backend disponible en http://localhost:${port}`);
});

// Tareas periódicas: solo al arrancar el servidor, nunca al importar app.js
const jobs = [startAbandonedOrdersJob(), startReconcileJob()];

let isShuttingDown = false;

// Cierre ordenado: parar los jobs, no aceptar conexiones nuevas, esperar a las peticiones en
// curso y a la pasada de job que esté en marcha (todo como máximo shutdownTimeoutMs) y cerrar
// el pool de PostgreSQL. Una segunda señal mientras se cierra no lo repite.
function shutdown(reason, exitCode) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`Cerrando el servidor (${reason})…`);
  // Ninguna pasada nueva; la que esté en curso se espera antes de cerrar el pool
  jobs.forEach((job) => job.stop());

  // Si las peticiones en curso no terminan a tiempo, se cortan. unref: este temporizador no
  // mantiene vivo el proceso si todo termina antes
  const forceExitTimer = setTimeout(() => {
    console.error(`El cierre no terminó en ${shutdownTimeoutMs} ms (peticiones o jobs en curso): se fuerza`);
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

    // Una pasada a medias chocaría con el pool cerrado: se espera a que termine
    await Promise.all(jobs.map((job) => job.waitForCurrentRun()));

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
