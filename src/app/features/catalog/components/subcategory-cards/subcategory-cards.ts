import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { categoryAllPath, categoryPath } from '@core/config/categories.config';
import type { Category } from '@core/models/category.models';

// Página intermedia de una categoría con subcategorías: una tarjeta (enlace con encabezado) por
// subcategoría, aunque esté vacía, y una tarjeta «Ver todo» con los productos de todas. Sin fotos:
// el recuadro lleva el tono de la categoría padre (CategoryService.placeholderTone)
@Component({
  selector: 'app-subcategory-cards',
  imports: [RouterLink],
  templateUrl: './subcategory-cards.html',
  styleUrl: './subcategory-cards.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubcategoryCards {
  readonly parent = input.required<Category>();
  readonly subcategories = input.required<readonly Category[]>();
  // Sufijo de clase del recuadro: beige | sand | graphite | linen
  readonly tone = input.required<string>();

  readonly categoryPath = categoryPath;
  readonly categoryAllPath = categoryAllPath;
}
