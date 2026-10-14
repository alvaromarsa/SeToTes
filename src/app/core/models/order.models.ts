export interface CreateOrderRequest {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface OrderResponse {
  id: number;
  status: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: string;
}
