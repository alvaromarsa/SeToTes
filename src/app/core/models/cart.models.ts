export interface CartItem {
  productId: number;
  name: string;
  color: string | null;
  category: string | null;
  price: number;
  stock: number;
  quantity: number;
  lineTotal: number;
  mainImage: { cardUrl: string } | null;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
  shippingCost: number;
}

export interface AddToCartResponse {
  productId: number;
  quantity: number;
}
