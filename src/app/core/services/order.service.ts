import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import type { CreateOrderRequest, OrderResponse } from '../models/order.models';
import { CartService } from './cart.service';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly cartService = inject(CartService);
  private readonly apiUrl = 'http://localhost:3000/api/orders';

  createOrder(data: CreateOrderRequest): Observable<OrderResponse> {
    return this.http
      .post<OrderResponse>(this.apiUrl, data, { withCredentials: true })
      .pipe(tap(() => this.cartService.clearLocalCart()));
  }
}
