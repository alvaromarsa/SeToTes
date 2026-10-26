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
  type OrderDetail,
} from '@core/models/order.models';
import { OrderService } from '@core/services/order.service';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly statusLabels = ORDER_STATUS_LABELS;

  order: OrderDetail | null = null;
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.orderService.getOrder(id).subscribe({
      next: (order) => {
        this.order = order;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cargar el pedido', error.status, error);
        this.errorMessage =
          error.status === 404
            ? 'No se encontró el pedido.'
            : 'No se pudo cargar el pedido.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
