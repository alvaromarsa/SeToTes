import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, EMPTY, map, of, switchMap, tap } from 'rxjs';

import { categoryPath, isValidCategorySlug } from '@core/config/categories.config';
import { CartService } from '@core/services/cart.service';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';
import { Product, ProductService } from '@core/services/product.service';

// /categoria/:slug. Angular REUTILIZA este componente al pasar de una categoría a otra (misma
// ruta, otro parámetro): por eso todo sale de paramMap y no de una lectura única al abrirse.
// Los productos se piden cuando ya se conoce la lista de categorías: así una dirección antigua
// redirige a la actual sin pedir nada y nunca se ve «no encontrada» mientras cargan.
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

  // Por el slug actual o por uno antiguo (previousSlugs): con uno antiguo se redirige al actual
  readonly category = computed(() => this.categoryService.findBySlug(this.slug()));
  // Solo se sabe que no existe cuando las categorías ya han cargado (nunca mientras cargan): p. ej.
  // una categoría borrada o un slug con formato inválido
  readonly notFound = computed(() => this.categoryService.status() === 'loaded' && !this.category());
  // Si fallara la carga de categorías, los productos se muestran igual con un título genérico
  readonly title = computed(() => this.category()?.name ?? 'Productos');
  readonly placeholderTone = computed(() => this.categoryService.placeholderTone(this.slug()));

  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  // Slugs no encontrados para los que ya se volvió a pedir la lista de categorías (una vez cada uno)
  private readonly revalidatedSlugs = new Set<string>();
  readonly errorMessage = signal('');

  // Qué productos pedir: undefined = esperar (categorías cargando o redirigiendo a la dirección
  // actual: no se piden los de un slug antiguo); null = ninguno (no existe o formato inválido);
  // un slug = pedir los de esa categoría
  private readonly productsSlug = computed<string | null | undefined>(() => {
    const status = this.categoryService.status();
    const slug = this.slug();

    if (status === 'idle' || status === 'loading') {
      return undefined;
    }

    // Formato inválido: sin petición (el servidor respondería 400) y sin error en consola
    if (!isValidCategorySlug(slug)) {
      return null;
    }

    // Sin la lista de categorías (falló su carga) no se puede comprobar nada: se piden igual
    if (status === 'error') {
      return slug;
    }

    const category = this.category();

    if (!category) {
      return null;
    }

    return category.slug === slug ? slug : undefined;
  });

  constructor() {
    this.categoryService.load();

    // Dirección antigua (la categoría se renombró): a la actual, SUSTITUYENDO la entrada del
    // historial (replaceUrl), para que «atrás» no vuelva a la antigua y redirija otra vez. También
    // las URL de antes (/bolsas → /categoria/bolsas → /categoria/<actual>)
    effect(() => {
      const category = this.category();
      const slug = this.slug();

      if (category && category.slug !== slug) {
        untracked(() => void this.router.navigate([categoryPath(category.slug)], { replaceUrl: true }));
      }
    });

    // Slug desconocido con la lista ya cargada: puede que la lista sea de antes de un renombrado
    // (pestaña abierta desde entonces). Se vuelve a pedir UNA vez antes de dar «no encontrada»
    effect(() => {
      const slug = this.slug();

      if (this.notFound() && isValidCategorySlug(slug) && !this.revalidatedSlugs.has(slug)) {
        this.revalidatedSlugs.add(slug);
        untracked(() => this.categoryService.reload());
      }
    });

    // Un cambio de slug cancela la petición anterior (switchMap) y carga la nueva categoría
    toObservable(this.productsSlug)
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.isLoading.set(true);
          this.errorMessage.set('');
          this.products.set([]);
        }),
        switchMap((slug) => {
          if (slug === undefined) {
            // Sigue «Cargando…» hasta que se sepa qué pedir
            return EMPTY;
          }

          if (slug === null) {
            return of([] as Product[]);
          }

          return this.productService.getProducts(slug).pipe(
            catchError((error: unknown) => {
              console.error('No se pudieron cargar los productos', error);
              this.errorMessage.set(getErrorMessage(error, 'No se pudieron cargar los productos. Recarga la página.'));
              return of([] as Product[]);
            }),
          );
        }),
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
