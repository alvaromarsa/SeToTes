import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, EMPTY, map, of, switchMap, tap } from 'rxjs';

import { categoryAllPath, categoryPath, isValidCategorySlug } from '@core/config/categories.config';
import { CartService } from '@core/services/cart.service';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';
import { Product, ProductService } from '@core/services/product.service';
import { type BreadcrumbItem, Breadcrumbs } from '@shared/components/breadcrumbs/breadcrumbs';
import { SubcategoryCards } from './components/subcategory-cards/subcategory-cards';

// /categoria/:slug. Angular REUTILIZA este componente al pasar de una categoría a otra (misma
// ruta, otro parámetro): por eso todo sale de paramMap y no de una lectura única al abrirse.
// Los productos se piden cuando ya se conoce la lista de categorías: así una dirección antigua
// redirige a la actual sin pedir nada y nunca se ve «no encontrada» mientras cargan.
// Tres casos (subcategorías, migración 011), decididos solo con la lista cargada:
// - categoría con subcategorías: página intermedia con una tarjeta por subcategoría y «Ver todo»
//   (no pide productos);
// - subcategoría: sus productos, con miga de pan Inicio › Padre › Sub;
// - categoría sin subcategorías: sus productos, como siempre.
// /categoria/<padre>/todo («Ver todo», data.all): los de todas sus subcategorías
// (GET /api/products?category=<padre>), con miga Inicio › Padre › Todo.
@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [Breadcrumbs, CurrencyPipe, RouterLink, SubcategoryCards],
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
  // «No encontrada» ofrece solo las de primer nivel (las mismas que la navbar)
  readonly categories = this.categoryService.topLevelCategories;
  // /categoria/<slug>/todo
  private readonly showAll = this.route.snapshot.data['all'] === true;

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')),
    { initialValue: '' },
  );

  // Por el slug actual o por uno antiguo (previousSlugs): con uno antiguo se redirige al actual
  readonly category = computed(() => this.categoryService.findBySlug(this.slug()));
  // Solo se sabe que no existe cuando las categorías ya han cargado (nunca mientras cargan): p. ej.
  // una categoría borrada o un slug con formato inválido
  readonly notFound = computed(() => this.categoryService.status() === 'loaded' && !this.category());
  readonly subcategories = computed(() => {
    const category = this.category();
    return category ? this.categoryService.subcategoriesOf(category.id) : [];
  });
  private readonly parentCategory = computed(() => {
    const category = this.category();
    return category ? this.categoryService.parentOf(category) : undefined;
  });

  // Dirección a la que hay que ir (sustituyendo la entrada del historial), o null:
  // - slug antiguo → el actual (también con /todo);
  // - /todo de una categoría SIN subcategorías → su página normal
  private readonly redirectUrl = computed<string | null>(() => {
    const category = this.category();

    if (!category) {
      return null;
    }

    if (this.showAll && this.subcategories().length === 0) {
      return categoryPath(category.slug);
    }

    if (category.slug === this.slug()) {
      return null;
    }

    return this.showAll ? categoryAllPath(category.slug) : categoryPath(category.slug);
  });

  // Aún no se sabe qué página es (categorías cargando) o se está redirigiendo: solo «Cargando…»,
  // sin título ni «no encontrada» (sin parpadeo de un caso a otro)
  readonly isResolving = computed(() => {
    const status = this.categoryService.status();
    const pending = status === 'idle' || status === 'loading';
    return (pending && !this.category()) || this.redirectUrl() !== null;
  });

  // Página intermedia: categoría con subcategorías (no en /todo)
  readonly isParentPage = computed(
    () => !this.showAll && this.redirectUrl() === null && this.subcategories().length > 0,
  );

  // Si fallara la carga de categorías, los productos se muestran igual con un título genérico
  readonly title = computed(() => {
    const name = this.category()?.name;
    return name ? (this.showAll ? `Todo en ${name}` : name) : 'Productos';
  });
  readonly parentTone = computed(() => this.categoryService.placeholderTone(this.slug()));

  // Inicio › Padre › Sub (subcategoría) o Inicio › Padre › Todo («Ver todo»); nada en las demás
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const category = this.category();
    const parent = this.parentCategory();

    if (category && this.showAll) {
      return [{ label: 'Inicio', link: '/home' }, { label: category.name, link: categoryPath(category.slug) }, { label: 'Todo' }];
    }

    if (category && parent) {
      return [{ label: 'Inicio', link: '/home' }, { label: parent.name, link: categoryPath(parent.slug) }, { label: category.name }];
    }

    return [];
  });

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

    if (!this.category()) {
      return null;
    }

    // Redirigiendo: no se piden los de un slug antiguo
    if (this.redirectUrl() !== null) {
      return undefined;
    }

    // Página intermedia: solo tarjetas. En /todo y en las demás, el servidor devuelve los de la
    // categoría (con una que tiene subcategorías, los de todas ellas)
    return this.isParentPage() ? null : slug;
  });

  constructor() {
    this.categoryService.load();

    // Dirección antigua (la categoría se renombró): a la actual, SUSTITUYENDO la entrada del
    // historial (replaceUrl), para que «atrás» no vuelva a la antigua y redirija otra vez. También
    // las URL de antes (/bolsas → /categoria/bolsas → /categoria/<actual>)
    effect(() => {
      const url = this.redirectUrl();

      if (url !== null) {
        untracked(() => void this.router.navigateByUrl(url, { replaceUrl: true }));
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

  // Recuadro sin foto: el tono de la categoría del producto (el de su padre si es subcategoría)
  toneOf(product: Product): string {
    return this.categoryService.placeholderTone(product.category);
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
