import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Product, ProductCategory } from '@core/services/product.service';

// Un producto por categoría (lo elige la portada); puede no tener imagen
export interface NewArrival {
  category: ProductCategory;
  categoryTitle: string;
  product: Product;
}

@Component({
  selector: 'app-new-arrivals',
  imports: [CurrencyPipe, RouterLink],
  standalone: true,
  templateUrl: './new-arrivals.html',
  styleUrl: './new-arrivals.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewArrivals {
  readonly items = input.required<NewArrival[]>();
}
