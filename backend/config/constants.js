const CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'];

const SHIPPING_COST = 7.5;

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
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
};
