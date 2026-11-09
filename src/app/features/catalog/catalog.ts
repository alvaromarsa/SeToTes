import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CATEGORY_INFO } from '@core/config/categories.config';
import { CartService } from '@core/services/cart.service';
import { Product, ProductCategory, ProductService,} from '@core/services/product.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
})
export class Catalog implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly category = this.route.snapshot.data['category'] as ProductCategory;
  readonly info = CATEGORY_INFO[this.category];

  products: Product[] = [];
  errorMessage = '';

  ngOnInit(): void {
    this.productService.getProducts(this.category).subscribe({
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
        console.error('Error al añadir al carrito', error.status, error);

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
