import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CategoryService } from '@core/services/category.service';
import { ProductService, type Product } from '@core/services/product.service';
import { NewArrivals, type NewArrival } from './components/new-arrivals/new-arrivals';
import { TrustStrip } from './components/trust-strip/trust-strip';

const NEW_ARRIVALS_LIMIT = 4;

@Component({
  selector: 'app-home',
  imports: [NewArrivals, TrustStrip],
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly destroyRef = inject(DestroyRef);

  // Una sola petición: todos los productos visibles
  private readonly products = signal<Product[]>([]);

  // Novedades: el último producto creado (id más alto) de cada categoría, y de esas, como mucho
  // las 4 categorías con el producto más reciente, de la más nueva a la más antigua. Sin imagen,
  // la tarjeta muestra el color plano de su categoría (placeholderTone)
  readonly newArrivals = computed<NewArrival[]>(() => {
    const latestByCategory = new Map<string, Product>();

    for (const product of this.products()) {
      const current = latestByCategory.get(product.category);
      if (!current || product.id > current.id) {
        latestByCategory.set(product.category, product);
      }
    }

    return [...latestByCategory.values()]
      .sort((a, b) => b.id - a.id)
      .slice(0, NEW_ARRIVALS_LIMIT)
      .map((product) => ({
        product,
        // Mientras cargan las categorías (o si fallan), el slug
        categoryTitle: this.categoryService.findBySlug(product.category)?.name ?? product.category,
        placeholderTone: this.categoryService.placeholderTone(product.category),
      }));
  });

  ngOnInit(): void {
    this.categoryService.load();

    this.productService
      .getProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => this.products.set(products),
        // Excepción consciente a getErrorMessage: es contenido secundario. Si falla, solo
        // desaparece "Novedades"; el resto de la portada no depende de los productos
        error: (error: unknown) => console.error('No se pudieron cargar los productos de la portada', error),
      });
  }
}
