import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit,} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ORDER_STATUS_LABELS, type OrderSummary,} from '../../core/models/order.models';
import { OrderService } from '../../core/services/order.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Orders implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly statusLabels = ORDER_STATUS_LABELS;

  orders: OrderSummary[] = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.orderService.getMyOrders().subscribe({
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
