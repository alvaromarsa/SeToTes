import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  color: string;
}

@Injectable({ providedIn: 'root' })

export class ProductService {
  private http = inject(HttpClient);

  getProducts() {
    return this.http.get<Product[]>('http://localhost:3000/api/products');
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
