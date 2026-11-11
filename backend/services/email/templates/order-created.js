const { escapeHtml } = require('./escape-html');
const { button, formatMoney, paragraph, renderLayout } = require('./layout');

const CELL = 'padding:6px 0;border-bottom:1px solid #f0e9e4;font-size:14px;';

// order: { id, subtotal, shippingCost, total, items: [{ name, quantity, unitPrice, lineTotal }],
//          shipping: { fullName, phone, address, city, postalCode } }
function orderCreatedEmail({ order, orderUrl }) {
  const title = `Hemos recibido tu pedido n.º ${order.id}`;
  const { shipping } = order;

  const itemRows = order.items
    .map(
      (item) => `<tr>
        <td style="${CELL}">${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</td>
        <td style="${CELL}text-align:right;">${escapeHtml(formatMoney(item.lineTotal))}</td>
      </tr>`
    )
    .join('\n');

  const totalsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
      ${itemRows}
      <tr><td style="${CELL}">Subtotal</td><td style="${CELL}text-align:right;">${escapeHtml(formatMoney(order.subtotal))}</td></tr>
      <tr><td style="${CELL}">Envío</td><td style="${CELL}text-align:right;">${escapeHtml(formatMoney(order.shippingCost))}</td></tr>
      <tr><td style="padding:8px 0;font-size:15px;font-weight:bold;">Total</td><td style="padding:8px 0;font-size:15px;font-weight:bold;text-align:right;">${escapeHtml(formatMoney(order.total))}</td></tr>
    </table>`;

  const addressHtml = paragraph(
    [
      '<strong>Dirección de envío</strong>',
      escapeHtml(shipping.fullName),
      escapeHtml(shipping.address),
      `${escapeHtml(shipping.postalCode)} ${escapeHtml(shipping.city)}`,
      `Tel.: ${escapeHtml(shipping.phone)}`,
    ].join('<br>')
  );

  const { html, text } = renderLayout({
    title,
    bodyHtml: [
      paragraph(`Hola, ${escapeHtml(shipping.fullName)}:`),
      paragraph('Gracias por tu compra. Este es el resumen de tu pedido; está pendiente de pago.'),
      totalsHtml,
      addressHtml,
      button(escapeHtml(orderUrl), 'Ver mi pedido'),
    ].join('\n'),
    bodyText: [
      `Hola, ${shipping.fullName}:`,
      '',
      'Gracias por tu compra. Este es el resumen de tu pedido; está pendiente de pago.',
      '',
      ...order.items.map((item) => `- ${item.name} × ${item.quantity}: ${formatMoney(item.lineTotal)}`),
      '',
      `Subtotal: ${formatMoney(order.subtotal)}`,
      `Envío: ${formatMoney(order.shippingCost)}`,
      `Total: ${formatMoney(order.total)}`,
      '',
      'Dirección de envío:',
      shipping.fullName,
      shipping.address,
      `${shipping.postalCode} ${shipping.city}`,
      `Tel.: ${shipping.phone}`,
      '',
      `Ver mi pedido: ${orderUrl}`,
    ].join('\n'),
  });

  return { subject: title, text, html };
}

module.exports = { orderCreatedEmail };
