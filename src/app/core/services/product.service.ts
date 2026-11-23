import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '@core/config/api.config';
import type { AdminProduct, ProductVisibilityRequest } from '@core/models/admin-product.models';
import type { ProductImage, ProductMainImage } from '@core/models/product-image.models';

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  color: string | null;
  // Slug de la categoría (tabla categories; nombre y orden en CategoryService)
  category: string;
  images: ProductImage[];
  mainImage: ProductMainImage | null;
}

// Máximo de la descripción (igual que PRODUCT_DESCRIPTION_MAX_LENGTH del backend, que es quien manda)
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;

// Detalle de un producto (/api/products/:id y administración). El listado del catálogo no
// trae la descripción. Es texto plano: se muestra siempre con interpolación, nunca como HTML
export interface DetailedProduct extends Product {
  description: string | null;
}

// Datos que el formulario del admin envía al crear o editar (las imágenes van aparte).
// Una descripción vacía la guarda el servidor como null
export type ProductInput = Pick<Product, 'name' | 'price' | 'stock' | 'color' | 'category'> & {
  description: string;
};

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/api/products`;
  private readonly adminApiUrl = `${API_BASE_URL}/api/admin/products`;

  // category: slug de la categoría (cualquiera de la tabla categories, no solo las 4 iniciales)
  getProducts(category?: string) {
    return this.http.get<Product[]>(this.apiUrl, {
      params: category ? { category } : {},
    });
  }

  getProduct(id: number) {
    return this.http.get<DetailedProduct>(`${this.apiUrl}/${id}`);
  }

  // Todos los productos, visibles y ocultos (solo admin)
  getAdminProducts() {
    return this.http.get<AdminProduct[]>(this.adminApiUrl, { withCredentials: true });
  }

  setProductVisibility(id: number, isVisible: boolean) {
    const body: ProductVisibilityRequest = { isVisible };

    return this.http.patch<AdminProduct>(`${this.adminApiUrl}/${id}/visibility`, body, {
      withCredentials: true,
    });
  }

  // Crear y editar solo los usa el admin: el backend responde con el formato de administración
  createProduct(product: ProductInput) {
    return this.http.post<AdminProduct>(
      this.apiUrl,
      product,
      { withCredentials: true },
    );
  }

  updateProduct(id: number, product: ProductInput) {
    return this.http.put<AdminProduct>(
      `${this.apiUrl}/${id}`,
      product,
      { withCredentials: true },
    );
  }
}
