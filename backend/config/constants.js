// Nombre de la tienda en los emails (el frontend lo tiene en core/config/legal.config.ts)
const STORE_NAME = 'SeToTes';

const CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'];

const SHIPPING_COST = 7.5;

// Única fuente del máximo de imágenes por producto (el frontend tiene una copia solo para la interfaz)
const MAX_PRODUCT_IMAGES = 3;

// Coincide con el CHECK products_description_length_check (migración 006). Se cuentan
// caracteres, no unidades UTF-16 (un emoji cuenta 1, como char_length en PostgreSQL)
const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;

// Ajustes de la tienda (tabla store_settings, migración 006): lista blanca de claves.
// field es el nombre en la API (camelCase) y label, el de los mensajes de error. defaultValue es
// el respaldo si falta la fila en la BD; el frontend tiene su propio respaldo si falla la petición.
// Todos son texto plano de una sola línea.
const STORE_SETTINGS = [
  {
    key: 'shipping_time_text',
    field: 'shippingTimeText',
    label: 'El tiempo de envío',
    minLength: 1,
    maxLength: 120,
    defaultValue: 'Entrega estimada en 3-5 días laborables',
  },
  {
    key: 'announcement_text',
    field: 'announcementText',
    label: 'El aviso general',
    minLength: 0,
    maxLength: 200,
    defaultValue: '',
  },
];

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
const TERMS_VERSION = '2026-11-21';
const PRIVACY_NOTICE_VERSION = '2026-11';

// Pedido 'pending' sin sesión de Stripe: se cancela pasado este tiempo (jobs/cancel-abandoned-orders.js)
const PENDING_ORDER_TTL_MINUTES = 60;
// Caducidad de la sesión de Stripe Checkout. Stripe exige al menos 30 minutos desde su
// creación; 35 deja margen por si el reloj del servidor va algo desfasado
const CHECKOUT_SESSION_TTL_MINUTES = 35;

// Reconciliación con Stripe (jobs/reconcile-stripe-orders.js): cubre webhooks perdidos.
// Edad mínima del pedido e intervalo entre pasadas: valores por defecto, configurables por
// entorno (RECONCILE_MIN_AGE_MINUTES y RECONCILE_INTERVAL_MINUTES, validados en config/env.js)
const RECONCILE_DEFAULT_MIN_AGE_MINUTES = 10;
const RECONCILE_DEFAULT_INTERVAL_MINUTES = 5;
// Pedidos revisados por pasada como máximo (los más antiguos primero)
const RECONCILE_BATCH_SIZE = 20;
// Sesión aún 'open' este tiempo después de su expires_at: Stripe debería haberla caducado ya,
// así que la reconciliación la expira y cancela el pedido
const RECONCILE_EXPIRY_GRACE_MINUTES = 10;

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
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  STORE_SETTINGS,
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
  RECONCILE_DEFAULT_MIN_AGE_MINUTES,
  RECONCILE_DEFAULT_INTERVAL_MINUTES,
  RECONCILE_BATCH_SIZE,
  RECONCILE_EXPIRY_GRACE_MINUTES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
};
