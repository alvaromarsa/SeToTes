import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { Product, ProductService } from '../../core/services/product.service';
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-bolsas',
  standalone: true,
  templateUrl: './bolsas.component.html',
  styleUrl: './bolsas.component.css',
})
export class BolsasComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  products: Product[] = [];
  errorMessage = '';

  ngOnInit(): void {
    this.productService.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('No se pudieron cargar los productos', error);
      },
    });
  }

  addToCart(product: Product): void {
    this.errorMessage = '';

    this.cartService.addItem(product.id).subscribe({
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          void this.router.navigateByUrl('/login');
          return;
        }

        this.errorMessage =
          error.error?.message ?? 'No se pudo añadir el producto al carrito';
        this.cdr.markForCheck();
      },
    });
  }
}
