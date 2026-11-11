// Nombre de la tienda en los emails (el frontend lo tiene en core/config/legal.config.ts)
const STORE_NAME = 'SeToTes';

const CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'];

const SHIPPING_COST = 7.5;

// Única fuente del máximo de imágenes por producto (el frontend tiene una copia solo para la interfaz)
const MAX_PRODUCT_IMAGES = 3;

// Coinciden con el CHECK users_role_check de la base de datos
const USER_ROLES = ['customer', 'admin'];

const USER_STATUSES = ['active', 'blocked'];

// Recuperación de contraseña: validez del enlace y longitud de contraseña (igual que el registro)
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;
const PASSWORD_MIN_LENGTH = 8;
// Tope para no pasar a argon2 entradas enormes
const PASSWORD_MAX_LENGTH = 128;

// Versiones de los textos legales aceptados (se guardan con el pedido y con el usuario).
// Cambiarlas cuando cambien las condiciones de compra o la política de privacidad.
const TERMS_VERSION = '2026-11';
const PRIVACY_NOTICE_VERSION = '2026-11';

// Pedido 'pending' sin sesión de Stripe: se cancela pasado este tiempo (jobs/cancel-abandoned-orders.js)
const PENDING_ORDER_TTL_MINUTES = 60;
// Caducidad de la sesión de Stripe Checkout. Stripe exige al menos 30 minutos desde su
// creación; 35 deja margen por si el reloj del servidor va algo desfasado
const CHECKOUT_SESSION_TTL_MINUTES = 35;

// Límite de intentos por IP (express-rate-limit, contador en memoria del proceso).
// Durante las pruebas se reinicia reiniciando el backend.
const RATE_LIMITS = {
  login: { windowMinutes: 15, max: 10 },
  register: { windowMinutes: 60, max: 5 },
  forgotPassword: { windowMinutes: 15, max: 5 },
  resetPassword: { windowMinutes: 15, max: 10 },
};

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

// 'paid' NO es una transición manual: solo la aplica el webhook firmado de Stripe
const ORDER_TRANSITIONS = {
  pending: ['cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

module.exports = {
  STORE_NAME,
  CATEGORIES,
  SHIPPING_COST,
  MAX_PRODUCT_IMAGES,
  USER_ROLES,
  USER_STATUSES,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  RATE_LIMITS,
  TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
  PENDING_ORDER_TTL_MINUTES,
  CHECKOUT_SESSION_TTL_MINUTES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
};
