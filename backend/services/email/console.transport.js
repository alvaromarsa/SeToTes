// Modo "console": no envía nada, imprime el email en la terminal para probar en local.
// config/env.js impide usarlo en producción, así que aquí sí pueden verse enlaces con token.
async function send({ to, subject, text }) {
  console.log(
    [
      '',
      '──────── EMAIL (modo console, no se ha enviado) ────────',
      `Para:   ${to}`,
      `Asunto: ${subject}`,
      '',
      text,
      '────────────────────────────────────────────────────────',
      '',
    ].join('\n')
  );
}

module.exports = { send };
