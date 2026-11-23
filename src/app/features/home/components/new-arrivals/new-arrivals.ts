import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Product } from '@core/services/product.service';

// Último producto de una categoría (lo elige la portada); puede no tener imagen.
// placeholderTone: sufijo de la clase del recuadro sin foto (CategoryService.placeholderTone)
export interface NewArrival {
  product: Product;
  categoryTitle: string;
  placeholderTone: string;
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
