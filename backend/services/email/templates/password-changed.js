const { escapeHtml } = require('./escape-html');
const { paragraph, renderLayout } = require('./layout');

function passwordChangedEmail({ fullName }) {
  const title = 'Tu contraseña ha sido cambiada';
  const name = escapeHtml(fullName);
  const warning =
    'Si no has sido tú, contacta con la tienda cuanto antes (encontrarás los datos en el aviso legal de la web): alguien podría haber accedido a tu email.';

  const { html, text } = renderLayout({
    title,
    bodyHtml: [
      paragraph(`Hola, ${name}:`),
      paragraph('La contraseña de tu cuenta se ha cambiado correctamente. Por seguridad, hemos cerrado todas las sesiones abiertas.'),
      paragraph(warning),
    ].join('\n'),
    bodyText: [
      `Hola, ${fullName}:`,
      '',
      'La contraseña de tu cuenta se ha cambiado correctamente. Por seguridad, hemos cerrado todas las sesiones abiertas.',
      warning,
    ].join('\n'),
  });

  return { subject: title, text, html };
}

module.exports = { passwordChangedEmail };
