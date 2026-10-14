import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';

import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-shopping-cart',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe],
  templateUrl: './shopping-cart.html',
  styleUrl: './shopping-cart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingCart {
  private readonly router = inject(Router);
  private readonly cartService = inject(CartService);

  readonly cart$ = this.cartService.cart$;
  readonly itemCount$ = this.cartService.itemCount$;

  isOpen = false;

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
}
