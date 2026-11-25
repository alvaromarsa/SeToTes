import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { categoryPath, isValidCategorySlug } from '@core/config/categories.config';
import { CartService } from '@core/services/cart.service';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';
import { Product, ProductService } from '@core/services/product.service';

// /categoria/:slug. Angular REUTILIZA este componente al pasar de una categoría a otra (misma
// ruta, otro parámetro): por eso todo sale de paramMap y no de una lectura única al abrirse.
@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Catalog {
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);

  readonly categoryPath = categoryPath;
  readonly categories = this.categoryService.categories;

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' },
  );

  readonly category = computed(() => this.categoryService.findBySlug(this.slug()));
  // Un slug con formato inválido no existe nunca. Si es válido, solo se sabe que no existe cuando
  // las categorías ya han cargado (no mientras cargan): p. ej. una categoría borrada
  readonly notFound = computed(
    () =>
      !isValidCategorySlug(this.slug()) || (this.categoryService.status() === 'loaded' && !this.category()),
  );
  // Si fallara la carga de categorías, los productos se muestran igual con un título genérico
  readonly title = computed(() => this.category()?.name ?? 'Productos');
  readonly placeholderTone = computed(() => this.categoryService.placeholderTone(this.slug()));

  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  constructor() {
    this.categoryService.load();

    // Un cambio de slug cancela la petición anterior (switchMap) y carga la nueva categoría
    this.route.paramMap
      .pipe(
        map((params) => params.get('slug') ?? ''),
        distinctUntilChanged(),
        tap(() => {
          this.isLoading.set(true);
          this.errorMessage.set('');
          this.products.set([]);
        }),
        // Formato inválido: sin petición (el servidor respondería 400) y sin error en consola
        switchMap((slug) =>
          !isValidCategorySlug(slug)
            ? of([] as Product[])
            : this.productService.getProducts(slug).pipe(
                catchError((error: unknown) => {
                  console.error('No se pudieron cargar los productos', error);
                  this.errorMessage.set(
                    getErrorMessage(error, 'No se pudieron cargar los productos. Recarga la página.'),
                  );
                  return of([] as Product[]);
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((products) => {
        this.products.set(products);
        this.isLoading.set(false);
      });
  }

  addToCart(product: Product): void {
    this.errorMessage.set('');

    this.cartService.addItem(product.id).subscribe({
      error: (error: HttpErrorResponse) => {
        console.error('Error al añadir al carrito', error.status, error);

        // Sin sesión: tras iniciar sesión vuelve a esta categoría
        if (error.status === 401) {
          void this.router.navigateByUrl(loginUrlTree(this.router, this.router.url));
          return;
        }

        this.errorMessage.set(getErrorMessage(error, 'No se pudo añadir el producto al carrito.'));
      },
    });
  }
}
