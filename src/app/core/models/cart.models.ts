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
  // false si el producto se ocultó después de añadirlo: no se puede pedir
  isAvailable: boolean;
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
