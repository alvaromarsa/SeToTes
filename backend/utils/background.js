// Ejecuta una tarea en segundo plano sin que su resultado afecte a la respuesta.
// Promise.resolve().then(task) convierte también los errores síncronos de task en un
// rechazo, y el .catch final lo captura siempre: nunca queda una promesa rechazada sin
// capturar que pueda tumbar el proceso de Node.
// context describe la tarea en el log; no debe incluir tokens, contraseñas ni datos personales.
function runInBackground(task, context) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`Error en segundo plano (${context}):`, error?.message ?? error);
    });
}

module.exports = { runInBackground };
