import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { take } from 'rxjs';

import type { OrderResponse } from '@core/models/order.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { OrderService } from '@core/services/order.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';
import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  // Opcional: no existe mientras el carrito se carga ni tras confirmar el pedido
  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  readonly formUtils = FormUtils;
  readonly cart$ = this.cartService.cart$;
  readonly hasUnavailableItems$ = this.cartService.hasUnavailableItems$;

  readonly checkoutForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required]],
    phone: ['', [Validators.required]],
    address: ['', [Validators.required]],
    city: ['', [Validators.required]],
    postalCode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
    // Solo en el frontend por ahora: la aceptación se guardará con el pedido (terms_accepted_at)
    acceptTerms: [false, [Validators.requiredTrue]],
  });

  isSubmitting = false;
  errorMessage = '';
  order: OrderResponse | null = null;

  ngOnInit(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.checkoutForm.patchValue({
          fullName: user.full_name,
          phone: user.phone,
          address: user.address ?? '',
          city: user.city ?? '',
          postalCode: user.postal_code ?? '',
        });
      }
    });
  }

  // Explica al lector de pantalla por qué el botón está desactivado
  submitDescribedBy(hasUnavailableItems: boolean): string | null {
    const ids: string[] = [];

    if (this.checkoutForm.controls.acceptTerms.invalid) {
      ids.push(this.checkoutForm.controls.acceptTerms.touched ? 'accept-terms-error' : 'accept-terms-hint');
    }
    if (hasUnavailableItems) {
      ids.push('checkout-unavailable-notice');
    }

    return ids.length > 0 ? ids.join(' ') : null;
  }

  onSubmit(): void {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    // La casilla no se envía: el backend solo recibe los datos de envío
    const { acceptTerms: _acceptTerms, ...shippingData } = this.checkoutForm.getRawValue();

    this.orderService.createOrder(shippingData).subscribe({
      next: (order) => {
        this.order = order;
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error al crear el pedido', error.status, error);

        if (error.status === 401) {
          void this.router.navigateByUrl(loginUrlTree(this.router, '/checkout'));
          return;
        }

        // 409: stock insuficiente o producto ya no disponible (el backend nombra el producto)
        this.errorMessage = getErrorMessage(error, 'No se pudo crear el pedido. Inténtalo de nuevo.');
        this.isSubmitting = false;
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.submitButton()?.nativeElement);
      },
    });
  }
}
