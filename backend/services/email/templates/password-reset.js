const { PASSWORD_RESET_TOKEN_TTL_MINUTES } = require('../../../config/constants');
const { escapeHtml } = require('./escape-html');
const { button, paragraph, renderLayout } = require('./layout');

// resetUrl lleva el token en claro: solo viaja en este email, nunca se registra en logs
function passwordResetEmail({ fullName, resetUrl }) {
  const title = 'Restablece tu contraseña';
  const name = escapeHtml(fullName);
  const url = escapeHtml(resetUrl);

  const { html, text } = renderLayout({
    title,
    bodyHtml: [
      paragraph(`Hola, ${name}:`),
      paragraph('Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Pulsa el botón para elegir una nueva:'),
      button(url, 'Elegir nueva contraseña'),
      paragraph(`El enlace caduca en ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutos y solo puede usarse una vez.`),
      paragraph('Si no has sido tú, ignora este mensaje: tu contraseña no cambiará.'),
    ].join('\n'),
    bodyText: [
      `Hola, ${fullName}:`,
      '',
      'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Abre este enlace para elegir una nueva:',
      resetUrl,
      '',
      `El enlace caduca en ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutos y solo puede usarse una vez.`,
      'Si no has sido tú, ignora este mensaje: tu contraseña no cambiará.',
    ].join('\n'),
  });

  return { subject: title, text, html };
}

module.exports = { passwordResetEmail };
