const CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'];

const SHIPPING_COST = 7.5;

// Única fuente del máximo de imágenes por producto (el frontend tiene una copia solo para la interfaz)
const MAX_PRODUCT_IMAGES = 3;

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

const ORDER_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

module.exports = {
  CATEGORIES,
  SHIPPING_COST,
  MAX_PRODUCT_IMAGES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
};
