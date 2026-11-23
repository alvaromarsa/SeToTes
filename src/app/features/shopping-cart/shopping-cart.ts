import { AsyncPipe, CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';

import type { CartItem } from '@core/models/cart.models';
import { CartService } from '@core/services/cart.service';
import { getErrorMessage } from '@core/utils/http-error-message';

@Component({
  selector: 'app-shopping-cart',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, NgTemplateOutlet, RouterLink],
  templateUrl: './shopping-cart.html',
  styleUrl: './shopping-cart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingCart {
  private readonly router = inject(Router);
  private readonly cartService = inject(CartService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly cart$ = this.cartService.cart$;
  readonly itemCount$ = this.cartService.itemCount$;
  readonly hasUnavailableItems$ = this.cartService.hasUnavailableItems$;

  isOpen = false;
  isUpdating = false;
  errorMessage = '';

  toggleCart(): void {
    this.isOpen = !this.isOpen;
  }

  closeCart(): void {
    this.isOpen = false;
  }

  goToCheckout(): void {
    this.closeCart();
    void this.router.navigateByUrl('/checkout');
  }

  increase(item: CartItem): void {
    this.run(
      this.cartService.updateQuantity(item.productId, item.quantity + 1),
      'No se pudo cambiar la cantidad',
    );
  }

  // Si la cantidad supera el stock (el admin lo bajó después), "−" la deja directamente en el
  // máximo disponible; si no, quita una unidad. Con stock 0 no hay "−" (solo "Quitar")
  decreaseTarget(item: CartItem): number {
    return Math.min(item.quantity - 1, item.stock);
  }

  decrease(item: CartItem): void {
    const quantity = this.decreaseTarget(item);

    if (quantity < 1) {
      return;
    }

    this.run(
      this.cartService.updateQuantity(item.productId, quantity),
      'No se pudo cambiar la cantidad',
    );
  }

  remove(item: CartItem): void {
    this.run(
      this.cartService.removeItem(item.productId),
      'No se pudo quitar el producto',
    );
  }

//Por qué Observable<unknown>
//El método run no usa el valor que emite el observable. Solo le importa saber cuándo termina bien (next) o cuándo falla (error).
// Los tres métodos que lo llaman devuelven Observable<CartResponse>, pero dentro de run ese CartResponse no se lee en ningún momento
  private run(request$: Observable<unknown>, fallbackMessage: string): void {
    this.isUpdating = true;
    this.errorMessage = '';

    request$.subscribe({
      next: () => {
        this.isUpdating = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error(fallbackMessage, error.status, error);
        // 409: no hay stock suficiente o el producto ya no está disponible
        this.errorMessage = getErrorMessage(error, fallbackMessage);
        this.isUpdating = false;
        this.cdr.markForCheck();
      },
    });
  }
}
