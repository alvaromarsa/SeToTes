const { runInBackground } = require('./background');

// Tarea periódica común a los jobs (jobs/*.js):
// - setInterval cada intervalMinutes;
// - sin solapamiento: si la pasada anterior sigue en marcha, se salta esta;
// - runInBackground: un fallo se registra y nunca tumba el proceso;
// - stop() y waitForCurrentRun() para el cierre ordenado de server.js, que deja de lanzar
//   pasadas nuevas y espera a la que esté en curso antes de cerrar el pool.
function startPeriodicJob({ name, intervalMinutes, task }) {
  let currentRun = null;

  const timer = setInterval(() => {
    if (currentRun) {
      return;
    }

    currentRun = runInBackground(task, name).finally(() => {
      currentRun = null;
    });
  }, intervalMinutes * 60 * 1000);

  return {
    stop() {
      clearInterval(timer);
    },
    // Nunca se rechaza (runInBackground ya captura los errores)
    waitForCurrentRun() {
      return currentRun ?? Promise.resolve();
    },
  };
}

module.exports = { startPeriodicJob };
