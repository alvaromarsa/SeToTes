import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

interface CheckoutItem {
  name: string;
  quantity: number;
  price: number;
  color: string;
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout {
  private readonly fb = inject(FormBuilder);

  readonly items: CheckoutItem[] = [
    { name: 'Bolsa Minimal', quantity: 1, price: 49.9, color: 'Beige' },
    { name: 'Neceser Clásico', quantity: 2, price: 38, color: 'Verde' },
  ];

  readonly shippingCost = 7.5;
  readonly deliveryDate = 'Lun, 30 sep';

  readonly checkoutForm = this.fb.nonNullable.group({
    userName: ['María López', [Validators.required]],
    shippingAddress: ['Calle Mayor 24, 2ºA, Madrid', [Validators.required]],
    cardNumber: ['**** **** **** 4837', [Validators.required]],
    promoCode: ['WELCOME10'],
  });

  get subtotal(): number {
    return this.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  }

  get total(): number {
    return this.subtotal + this.shippingCost;
  }
}
