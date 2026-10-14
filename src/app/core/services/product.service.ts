import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export const PRODUCT_CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  color: string | null;
  category: ProductCategory;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  getProducts(category?: ProductCategory) {
    return this.http.get<Product[]>('http://localhost:3000/api/products', {
      params: category ? { category } : {},
    });
  }

  createProduct(product: Omit<Product, 'id'>) {
    return this.http.post<Product>(
      'http://localhost:3000/api/products',
      product,
      { withCredentials: true },
    );
  }

  updateProduct(id: number, product: Omit<Product, 'id'>) {
    return this.http.put<Product>(
      `http://localhost:3000/api/products/${id}`,
      product,
      { withCredentials: true },
    );
  }
}
