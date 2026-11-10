import type { Product } from '@core/services/product.service';

// Producto tal como lo devuelve /api/admin/products: las rutas públicas no exponen la visibilidad
export interface AdminProduct extends Product {
  isVisible: boolean;
  imagesCount: number;
}

export interface ProductVisibilityRequest {
  isVisible: boolean;
}
