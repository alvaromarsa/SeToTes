const { STORE_NAME } = require('../../../config/constants');
const { escapeHtml } = require('./escape-html');

const moneyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function formatMoney(amount) {
  return moneyFormatter.format(Number(amount));
}

// Envoltorio común. bodyHtml ya debe venir escapado por la plantilla que lo construye;
// title se escapa aquí.
function renderLayout({ title, bodyHtml, bodyText }) {
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f9ece5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;">
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:14px;font-weight:bold;letter-spacing:1px;color:#704833;">${escapeHtml(STORE_NAME)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#6b7280;text-align:center;">
      Este es un mensaje automático de ${escapeHtml(STORE_NAME)}. Por favor, no respondas a este email.
    </p>
  </body>
</html>`;

  const text = `${STORE_NAME}\n\n${title}\n\n${bodyText}\n\n--\nEste es un mensaje automático de ${STORE_NAME}. Por favor, no respondas a este email.`;

  return { html, text };
}

function paragraph(htmlContent) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${htmlContent}</p>`;
}

// url y label deben venir ya escapados
function button(url, label) {
  return `<p style="margin:20px 0;"><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#ffffff;font-weight:bold;text-decoration:none;">${label}</a></p>`;
}

module.exports = { renderLayout, paragraph, button, formatMoney };
