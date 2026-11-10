import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { API_BASE_URL } from '@core/config/api.config';
import type { AdminProduct, ProductVisibilityRequest } from '@core/models/admin-product.models';
import type { ProductImage, ProductMainImage } from '@core/models/product-image.models';

export const PRODUCT_CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  color: string | null;
  category: ProductCategory;
  images: ProductImage[];
  mainImage: ProductMainImage | null;
}

// Datos que el formulario del admin envía al crear o editar (las imágenes van aparte)
export type ProductInput = Pick<Product, 'name' | 'price' | 'stock' | 'color' | 'category'>;

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/api/products`;
  private readonly adminApiUrl = `${API_BASE_URL}/api/admin/products`;

  getProducts(category?: ProductCategory) {
    return this.http.get<Product[]>(this.apiUrl, {
      params: category ? { category } : {},
    });
  }

  getProduct(id: number) {
    return this.http.get<Product>(`${this.apiUrl}/${id}`);
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
