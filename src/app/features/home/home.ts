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

  // Una sola petición: los NEW_ARRIVALS_LIMIT productos visibles más recientes de toda la tienda,
  // ya ordenados por el servidor (created_at DESC, id DESC). Sin agrupar por categoría: dos de la
  // misma pueden salir juntos
  private readonly products = signal<Product[]>([]);

  // Novedades: los productos tal como llegan. La lista de categorías solo pone la etiqueta y el
  // tono del recuadro sin foto (placeholderTone): no hace falta esperarla; mientras carga (o si
  // falla), la etiqueta muestra el slug y se actualiza sola al llegar
  readonly newArrivals = computed<NewArrival[]>(() =>
    this.products().map((product) => ({
      product,
      categoryTitle: this.categoryService.findBySlug(product.category)?.name ?? product.category,
      placeholderTone: this.categoryService.placeholderTone(product.category),
    })),
  );

  ngOnInit(): void {
    this.categoryService.load();

    this.productService
      .getNewestProducts(NEW_ARRIVALS_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => this.products.set(products),
        // Excepción consciente a getErrorMessage: es contenido secundario. Si falla, solo
        // desaparece "Novedades"; el resto de la portada no depende de los productos
        error: (error: unknown) => console.error('No se pudieron cargar los productos de la portada', error),
      });
  }
}
