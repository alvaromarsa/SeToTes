import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { CATEGORY_INFO } from '@core/config/categories.config';
import { ProductService, type Product, type ProductCategory } from '@core/services/product.service';
import { NewArrivals, type NewArrival } from './components/new-arrivals/new-arrivals';
import { TrustStrip } from './components/trust-strip/trust-strip';

@Component({
  selector: 'app-home',
  imports: [RouterLink, NewArrivals, TrustStrip],
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);

  // Una sola petición: todos los productos visibles
  private readonly products = signal<Product[]>([]);

  // Novedades: un producto por categoría, el último creado (id más alto) entre los visibles,
  // en el orden de CATEGORY_INFO. Las categorías sin productos no aparecen; sin imagen, sí
  // (la tarjeta muestra un color plano)
  readonly newArrivals = computed<NewArrival[]>(() =>
    (Object.keys(CATEGORY_INFO) as ProductCategory[]).flatMap((category) => {
      const latest = this.products()
        .filter((product) => product.category === category)
        .reduce<Product | null>((newest, product) => (!newest || product.id > newest.id ? product : newest), null);

      return latest ? [{ category, categoryTitle: CATEGORY_INFO[category].title, product: latest }] : [];
    }),
  );

  ngOnInit(): void {
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
