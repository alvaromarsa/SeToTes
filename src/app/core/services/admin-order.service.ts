import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '@core/config/api.config';
import type { Observable } from 'rxjs';

import type { AdminOrderDetail, AdminOrderSummary, OrderResponse, OrderStatus,} from '../models/order.models';

@Injectable({ providedIn: 'root' })
export class AdminOrderService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/api/admin/orders`;

  getOrders(status?: OrderStatus): Observable<AdminOrderSummary[]> {
    return this.http.get<AdminOrderSummary[]>(this.apiUrl, {
      params: status ? { status } : {},
      withCredentials: true,
    });
  }

  getOrder(id: number): Observable<AdminOrderDetail> {
    return this.http.get<AdminOrderDetail>(`${this.apiUrl}/${id}`, {
      withCredentials: true,
    });
  }

  updateStatus(id: number, status: OrderStatus): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(
      `${this.apiUrl}/${id}/status`,
      { status },
      { withCredentials: true },
    );
  }
}
