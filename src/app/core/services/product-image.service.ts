import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type { ProductImage, ReorderProductImagesRequest } from '@core/models/product-image.models';

@Injectable({ providedIn: 'root' })
export class ProductImageService {
  private readonly http = inject(HttpClient);

  private imagesUrl(productId: number): string {
    return `${API_BASE_URL}/api/products/${productId}/images`;
  }

  // Sin Content-Type a mano: el navegador lo pone con el boundary del multipart
  upload(productId: number, files: File[]): Observable<ProductImage[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('images', file);
    }

    return this.http.post<ProductImage[]>(this.imagesUrl(productId), formData, {
      withCredentials: true,
    });
  }

  // Devuelve las imágenes que quedan, ya ordenadas
  remove(productId: number, imageId: number): Observable<ProductImage[]> {
    return this.http.delete<ProductImage[]>(`${this.imagesUrl(productId)}/${imageId}`, {
      withCredentials: true,
    });
  }

  reorder(productId: number, imageIds: number[]): Observable<ProductImage[]> {
    const body: ReorderProductImagesRequest = { imageIds };

    return this.http.put<ProductImage[]>(`${this.imagesUrl(productId)}/order`, body, {
      withCredentials: true,
    });
  }
}
