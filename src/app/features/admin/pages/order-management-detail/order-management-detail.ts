import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  ORDER_STATUS_LABELS,
  type AdminOrderDetail,
  type OrderStatus,
} from '../../../../core/models/order.models';
import { AdminOrderService } from '../../../../core/services/admin-order.service';

@Component({
  selector: 'app-order-management-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './order-management-detail.html',
  styleUrl: './order-management-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderManagementDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly adminOrderService = inject(AdminOrderService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly statusLabels = ORDER_STATUS_LABELS;

  order: AdminOrderDetail | null = null;
  isLoading = true;
  isUpdating = false;
  loadError = '';
  actionError = '';
  actionSuccess = '';

  private orderId = 0;

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadOrder();
  }

  changeStatus(status: OrderStatus): void {
    if (!this.order) {
      return;
    }

    const label = this.statusLabels[status];
    const confirmed = window.confirm(
      `¿Cambiar el pedido #${this.order.id} a "${label}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    this.isUpdating = true;
    this.actionError = '';
    this.actionSuccess = '';

    this.adminOrderService.updateStatus(this.orderId, status).subscribe({
      next: () => {
        this.isUpdating = false;
        this.actionSuccess = `Estado cambiado a "${label}".`;
        this.cdr.markForCheck();
        this.loadOrder();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cambiar el estado', error.status, error);
        this.isUpdating = false;
        this.actionError =
          error.error?.message ?? 'No se pudo cambiar el estado.';
        this.cdr.markForCheck();
        this.loadOrder();
      },
    });
  }

  private loadOrder(): void {
    this.adminOrderService.getOrder(this.orderId).subscribe({
      next: (order) => {
        this.order = order;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cargar el pedido', error.status, error);
        this.loadError =
          error.status === 404
            ? 'No se encontró el pedido.'
            : 'No se pudo cargar el pedido.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
