// Servicio de email. El resto del backend solo usa sendEmail({ to, subject, text, html })
// o, para no retrasar ni romper la operación principal, sendEmailInBackground.
// Igual que storage/: cambiar de proveedor es cambiar el transporte, no las rutas.
const { emailMode } = require('../../config/env');
const { runInBackground } = require('../../utils/background');

const transport = emailMode === 'smtp'
  ? require('./smtp.transport')
  : require('./console.transport');

async function sendEmail({ to, subject, text, html }) {
  if (!to || !subject || !text) {
    throw new Error('Faltan datos del email (destinatario, asunto o texto)');
  }

  await transport.send({ to, subject, text, html });
}

// Se usa DESPUÉS del commit: nunca se espera al envío para responder y un fallo solo
// queda en el log. context describe el email sin datos sensibles (p. ej. "pedido 12 creado").
function sendEmailInBackground(message, context) {
  runInBackground(() => sendEmail(message), `email: ${context}`);
}

module.exports = { sendEmail, sendEmailInBackground };
