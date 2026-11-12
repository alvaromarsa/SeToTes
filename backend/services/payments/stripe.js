const Stripe = require('stripe');

const { frontendUrl, stripe: stripeConfig } = require('../../config/env');
const { CHECKOUT_SESSION_TTL_MINUTES } = require('../../config/constants');

// Cliente único del SDK oficial. Sin apiVersion: se usa la que fija el SDK instalado
// (stripe@23.0.1 → 2026-09-30.endive), así el SDK y la API siempre coinciden.
// timeout y pocos reintentos: algunas llamadas se hacen con un pedido bloqueado (FOR UPDATE)
// y una conexión del pool ocupada; una llamada colgada no debe retenerlos más de lo necesario.
// En los reintentos, el SDK añade solo una clave de idempotencia: no se duplican sesiones.
const stripeClient = new Stripe(stripeConfig.secretKey, {
  timeout: 15_000,
  maxNetworkRetries: 1,
});

function isStripeError(error) {
  return error instanceof Stripe.errors.StripeError;
}

// Líneas para Stripe desde el snapshot del pedido. Los importes ya llegan en céntimos
// enteros calculados en SQL ((unit_price * 100)::integer): ningún precio pasa por coma flotante.
function toLineItems(items, shippingCents) {
  const lineItems = items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: 'eur',
      unit_amount: item.unit_amount_cents,
      product_data: { name: item.product_name },
    },
  }));

  if (shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: shippingCents,
        product_data: { name: 'Gastos de envío' },
      },
    });
  }

  return lineItems;
}

// Precios con IVA incluido: sin Stripe Tax ni recogida de dirección (ya está en el pedido).
// Los métodos de pago se activan en el panel de Stripe (esta versión de la API ya no admite
// payment_method_types). allowed_payment_method_types FILTRA lo activado en el panel: solo se
// ofrece tarjeta (Apple Pay y Google Pay también son tarjeta), que se cobra al momento.
// Un método asíncrono (SEPA, etc.) exigiría antes tratar en el webhook
// checkout.session.async_payment_succeeded y async_payment_failed.
async function createCheckoutSession({ orderId, customerEmail, items, shippingCents }) {
  const orderUrl = `${frontendUrl}/orders/${orderId}`;

  return stripeClient.checkout.sessions.create({
    mode: 'payment',
    allowed_payment_method_types: ['card'],
    currency: 'eur',
    locale: 'es',
    customer_email: customerEmail,
    client_reference_id: String(orderId),
    metadata: { orderId: String(orderId) },
    line_items: toLineItems(items, shippingCents),
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_MINUTES * 60,
    success_url: `${orderUrl}?payment=success`,
    cancel_url: `${orderUrl}?payment=cancelled`,
  });
}

function retrieveCheckoutSession(sessionId) {
  return stripeClient.checkout.sessions.retrieve(sessionId);
}

// Expira una sesión abierta y devuelve la sesión ya expirada. Lanza el error si Stripe falla
// (por ejemplo, porque el cliente acaba de pagar y la sesión ya no está abierta).
function expireCheckoutSession(sessionId) {
  return stripeClient.checkout.sessions.expire(sessionId);
}

// Al cancelar un pedido: si su sesión sigue abierta, se cierra para que ya no se pueda pagar.
// "Mejor esfuerzo": si Stripe falla, se registra y la cancelación sigue adelante.
async function expireCheckoutSessionIfOpen(sessionId, orderId) {
  try {
    const session = await retrieveCheckoutSession(sessionId);

    if (session.status === 'open') {
      await stripeClient.checkout.sessions.expire(sessionId);
    }
  } catch (error) {
    console.error(
      `No se pudo expirar la sesión de Stripe del pedido #${orderId}; si llega un pago, habrá que reembolsarlo:`,
      error.type ?? '',
      error.message
    );
  }
}

// Verifica la firma: lanza un error si el cuerpo no viene de Stripe o se ha modificado
function constructWebhookEvent(rawBody, signature) {
  return stripeClient.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret);
}

module.exports = {
  isStripeError,
  createCheckoutSession,
  retrieveCheckoutSession,
  expireCheckoutSession,
  expireCheckoutSessionIfOpen,
  constructWebhookEvent,
};
