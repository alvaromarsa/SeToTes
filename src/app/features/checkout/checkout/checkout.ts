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

  onSubmit(): void {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.orderService.createOrder(this.checkoutForm.getRawValue()).subscribe({
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
