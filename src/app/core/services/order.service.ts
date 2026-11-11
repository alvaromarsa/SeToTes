import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type {
  CheckoutSessionResponse,
  CreateOrderRequest,
  OrderDetail,
  OrderResponse,
  OrderSummary,
} from '../models/order.models';
import { CartService } from './cart.service';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly cartService = inject(CartService);
  private readonly apiUrl = `${API_BASE_URL}/api/orders`;

  createOrder(data: CreateOrderRequest): Observable<OrderResponse> {
    return this.http
      .post<OrderResponse>(this.apiUrl, data, { withCredentials: true })
      .pipe(tap(() => this.cartService.clearLocalCart()));
  }

  // Crea o reutiliza la sesión de Stripe Checkout del pedido (los importes los pone el backend)
  createCheckoutSession(orderId: number): Observable<CheckoutSessionResponse> {
    return this.http.post<CheckoutSessionResponse>(`${this.apiUrl}/${orderId}/checkout-session`, {}, {
      withCredentials: true,
    });
  }

  getMyOrders(): Observable<OrderSummary[]> {
    return this.http.get<OrderSummary[]>(this.apiUrl, {
      withCredentials: true,
    });
  }

  getOrder(id: number): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`${this.apiUrl}/${id}`, {
      withCredentials: true,
    });
  }
}
