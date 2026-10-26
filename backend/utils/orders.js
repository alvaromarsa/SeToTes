class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function formatOrder(row) {
  return {
    id: row.id,
    status: row.status,
    subtotal: Number(row.subtotal),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    createdAt: row.created_at,
  };
}

module.exports = { OrderError, formatOrder };
