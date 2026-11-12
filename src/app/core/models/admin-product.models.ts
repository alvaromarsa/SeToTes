import type { DetailedProduct } from '@core/services/product.service';

// Producto tal como lo devuelve /api/admin/products: las rutas públicas no exponen la visibilidad
export interface AdminProduct extends DetailedProduct {
  isVisible: boolean;
  imagesCount: number;
}

export interface ProductVisibilityRequest {
  isVisible: boolean;
}
