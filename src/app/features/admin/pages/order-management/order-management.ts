import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type AdminOrderSummary,
  type OrderStatus,
} from '../../../../core/models/order.models';
import { AdminOrderService } from '../../../../core/services/admin-order.service';

@Component({
  selector: 'app-order-management',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './order-management.html',
  styleUrl: './order-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderManagement implements OnInit {
  private readonly adminOrderService = inject(AdminOrderService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly statuses = ORDER_STATUSES;
  readonly statusLabels = ORDER_STATUS_LABELS;

  orders: AdminOrderSummary[] = [];
  selectedStatus: OrderStatus | '' = '';
  isLoading = true;
  errorMessage = '';

  private loadSubscription?: Subscription;

  ngOnInit(): void {
    this.load();
  }

  onFilterChange(event: Event): void {
    this.selectedStatus = (event.target as HTMLSelectElement).value as
      | OrderStatus
      | '';
    this.load();
  }

  private load(): void {
    this.loadSubscription?.unsubscribe();
    this.isLoading = true;
    this.errorMessage = '';

    this.loadSubscription = this.adminOrderService
      .getOrders(this.selectedStatus || undefined)
      .subscribe({
        next: (orders) => {
          this.orders = orders;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('No se pudieron cargar los pedidos', error);
          this.errorMessage = 'No se pudieron cargar los pedidos.';
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }
}
