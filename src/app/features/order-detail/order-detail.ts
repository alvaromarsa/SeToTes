import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap, take, takeWhile, timer } from 'rxjs';

import {
  ORDER_STATUS_LABELS,
  type OrderDetail,
} from '@core/models/order.models';
import { OrderService } from '@core/services/order.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { ConfirmDialog } from '@shared/components/confirm-dialog/confirm-dialog';
import { focusAfterRender } from '@shared/utils/focus-after-render';

// Tras volver de Stripe: se consulta el pedido cada 3 s durante 30 s como máximo
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_ATTEMPTS = 10;

type PaymentNotice =
  | { kind: 'confirming' | 'success' | 'processing' | 'cancelled'; text: string }
  | null;

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, ConfirmDialog],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly payButton = viewChild<ElementRef<HTMLButtonElement>>('payButton');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly cancelDialog = viewChild.required(ConfirmDialog);

  readonly statusLabels = ORDER_STATUS_LABELS;

  order: OrderDetail | null = null;
  isLoading = true;
  errorMessage = '';
  paymentNotice: PaymentNotice = null;
  isStartingPayment = false;
  payErrorMessage = '';

  // Cancelación de un pedido sin pagar (estado con signals: OnPush los repinta solo)
  readonly isCancelling = signal(false);
  readonly cancelNotice = signal('');
  readonly cancelErrorMessage = signal('');

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    // Solo indica de dónde viene el usuario: NUNCA se da un pago por bueno por este parámetro.
    // El pedido pasa a 'paid' únicamente desde el webhook firmado de Stripe.
    const paymentResult = this.route.snapshot.queryParamMap.get('payment');

    if (paymentResult) {
      // Fuera de la URL: recargar o compartir el enlace no repite el aviso
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { payment: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.orderService.getOrder(id).subscribe({
      next: (order) => {
        this.order = order;
        this.isLoading = false;

        if (paymentResult === 'success') {
          this.waitForPaymentConfirmation(id);
        } else if (paymentResult === 'cancelled' && order.status === 'pending') {
          this.paymentNotice = {
            kind: 'cancelled',
            text: 'Has cancelado el pago. Tu pedido sigue pendiente: puedes pagarlo cuando quieras.',
          };
        }

        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cargar el pedido', error.status, error);
        this.errorMessage = getErrorMessage(error, 'No se pudo cargar el pedido.');
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // Crea o reutiliza la sesión de Stripe y sale hacia la página de pago de Stripe
  payNow(): void {
    if (!this.order || this.order.status !== 'pending' || this.isStartingPayment) {
      return;
    }

    this.isStartingPayment = true;
    this.payErrorMessage = '';

    this.orderService.createCheckoutSession(this.order.id).subscribe({
      next: ({ url }) => {
        // isStartingPayment sigue en true: el navegador abandona la tienda
        window.location.assign(url);
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo iniciar el pago', error.status, error);
        // 409: el pedido ya no está pendiente o el pago ya se está procesando
        this.payErrorMessage = getErrorMessage(error, 'No se pudo abrir la página de pago. Inténtalo de nuevo.');
        this.isStartingPayment = false;
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.payButton()?.nativeElement);
      },
    });
  }

  // Pide confirmación con el <dialog> común; al cerrarse, el foco vuelve al botón
  askCancel(): void {
    if (this.order?.status !== 'pending' || this.isCancelling()) {
      return;
    }

    this.cancelDialog().open(this.cancelButton()?.nativeElement);
  }

  // El backend cierra antes la sesión de Stripe (si la hay) y devuelve el stock
  cancelOrder(): void {
    const order = this.order;

    if (order?.status !== 'pending' || this.isCancelling()) {
      return;
    }

    this.isCancelling.set(true);
    this.cancelErrorMessage.set('');
    this.payErrorMessage = '';

    this.orderService.cancelOrder(order.id).subscribe({
      next: ({ status }) => {
        this.order = { ...order, status };
        this.paymentNotice = null;
        this.isCancelling.set(false);
        this.cancelNotice.set('Has cancelado el pedido. No se te ha cobrado nada.');
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cancelar el pedido', error.status, error);
        // 409: ya pagado, pago en curso o ya cancelado; 502: Stripe no responde
        this.cancelErrorMessage.set(getErrorMessage(error, 'No se pudo cancelar el pedido. Inténtalo de nuevo.'));
        this.isCancelling.set(false);
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.cancelButton()?.nativeElement);

        // El estado cambió entre medias (p. ej., ya está pagado): se muestra el actual
        if (error.status === 409) {
          this.orderService.getOrder(order.id).subscribe({
            next: (latest) => {
              this.order = latest;
              this.cdr.markForCheck();
            },
            error: () => undefined,
          });
        }
      },
    });
  }

  // El webhook puede tardar unos segundos en llegar: se consulta el pedido hasta que figure
  // como pagado o hasta agotar los intentos. takeUntilDestroyed para la consulta al salir.
  private waitForPaymentConfirmation(id: number): void {
    if (this.order?.status !== 'pending') {
      this.showPaymentResult();
      return;
    }

    this.paymentNotice = { kind: 'confirming', text: 'Estamos confirmando tu pago…' };

    timer(PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_INTERVAL_MS)
      .pipe(
        take(PAYMENT_POLL_ATTEMPTS),
        switchMap(() => this.orderService.getOrder(id)),
        // true: también se emite el pedido que ya no está pendiente
        takeWhile((order) => order.status === 'pending', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (order) => {
          this.order = order;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          // Un fallo al consultar no dice nada del pago: se muestra el aviso de "procesando"
          console.error('No se pudo consultar el estado del pago', error);
          this.showPaymentResult();
        },
        complete: () => this.showPaymentResult(),
      });
  }

  private showPaymentResult(): void {
    this.paymentNotice =
      this.order && this.order.status !== 'pending' && this.order.status !== 'cancelled'
        ? { kind: 'success', text: '¡Pago confirmado! Gracias por tu compra. Te hemos enviado la confirmación por email.' }
        : { kind: 'processing', text: 'Tu pago se está procesando; te avisaremos por email cuando se confirme.' };
    this.cdr.markForCheck();
  }
}
