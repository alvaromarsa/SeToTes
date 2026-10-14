import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, map, Observable, switchMap, tap } from 'rxjs';

import type { AddToCartResponse, CartResponse } from '../models/cart.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/cart';
  private readonly authService = inject(AuthService);

  private readonly cartSubject = new BehaviorSubject<CartResponse>({
    items: [],
    total: 0,
  });

  readonly cart$ = this.cartSubject.asObservable();
  readonly itemCount$ = this.cart$.pipe(
    map((cart) => cart.items.reduce((sum, item) => sum + item.quantity, 0)),
  );

  constructor() {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.loadCart().subscribe({
          error: (error) => console.error('No se pudo cargar el carrito', error),
        });
      } else {
        this.clearLocalCart();
      }
    });
  }

  loadCart(): Observable<CartResponse> {
    return this.http
      .get<CartResponse>(this.apiUrl, { withCredentials: true })
      .pipe(tap((cart) => this.cartSubject.next(cart)));
  }

  addItem(productId: number, quantity = 1): Observable<CartResponse> {
    return this.http
      .post<AddToCartResponse>(
        `${this.apiUrl}/items`,
        { productId, quantity },
        { withCredentials: true },
      )
      .pipe(switchMap(() => this.loadCart()));
  }

  updateQuantity(productId: number, quantity: number): Observable<CartResponse> {
    return this.http
      .patch<AddToCartResponse>(
        `${this.apiUrl}/items/${productId}`,
        { quantity },
        { withCredentials: true },
      )
      .pipe(switchMap(() => this.loadCart()));
  }

  removeItem(productId: number): Observable<CartResponse> {
    return this.http
      .delete<void>(`${this.apiUrl}/items/${productId}`, {
        withCredentials: true,
      })
      .pipe(switchMap(() => this.loadCart()));
  }

  clearLocalCart(): void {
    this.cartSubject.next({ items: [], total: 0 });
  }
}
