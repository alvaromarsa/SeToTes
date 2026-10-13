export interface CartItem {
  productId: number;
  name: string;
  color: string | null;
  category: string | null;
  price: number;
  stock: number;
  quantity: number;
  lineTotal: number;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
}

export interface AddToCartResponse {
  productId: number;
  quantity: number;
}
