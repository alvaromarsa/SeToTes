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

  decrease(item: CartItem): void {
    if (item.quantity <= 1) {
      return;
    }

    this.run(
      this.cartService.updateQuantity(item.productId, item.quantity - 1),
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
        this.errorMessage = error.error?.message ?? fallbackMessage;
        this.isUpdating = false;
        this.cdr.markForCheck();
      },
    });
  }
}
