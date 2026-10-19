export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado',
  shipped: 'Enviado',
  cancelled: 'Cancelado',
};

export interface CreateOrderRequest {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface OrderResponse {
  id: number;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: string;
}

export interface OrderSummary extends OrderResponse {
  itemCount: number;
}

export interface OrderItem {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface ShippingInfo {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface OrderDetail extends OrderResponse {
  shipping: ShippingInfo;
  items: OrderItem[];
}
