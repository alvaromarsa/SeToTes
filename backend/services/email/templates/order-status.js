const { escapeHtml } = require('./escape-html');
const { button, paragraph, renderLayout } = require('./layout');

// Solo se avisa al cliente de estos estados (ver services/email/order-notifications.js)
const STATUS_MESSAGES = {
  shipped: {
    title: (orderId) => `Tu pedido n.º ${orderId} está en camino`,
    body: 'Tu pedido ha salido de nuestro taller y está en manos del transportista.',
  },
  delivered: {
    title: (orderId) => `Tu pedido n.º ${orderId} ha sido entregado`,
    body: 'Tu pedido figura como entregado. ¡Esperamos que lo disfrutes! Si algo no está bien, escríbenos.',
  },
};

function orderStatusEmail({ orderId, status, fullName, orderUrl }) {
  const message = STATUS_MESSAGES[status];
  const title = message.title(orderId);

  const { html, text } = renderLayout({
    title,
    bodyHtml: [
      paragraph(`Hola, ${escapeHtml(fullName)}:`),
      paragraph(escapeHtml(message.body)),
      button(escapeHtml(orderUrl), 'Ver mi pedido'),
    ].join('\n'),
    bodyText: [`Hola, ${fullName}:`, '', message.body, '', `Ver mi pedido: ${orderUrl}`].join('\n'),
  });

  return { subject: title, text, html };
}

module.exports = { orderStatusEmail, NOTIFIED_ORDER_STATUSES: Object.keys(STATUS_MESSAGES) };
