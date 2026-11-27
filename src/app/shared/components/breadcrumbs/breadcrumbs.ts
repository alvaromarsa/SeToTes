import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// Un paso de la miga de pan. Sin link: es la página actual (el último)
export interface BreadcrumbItem {
  label: string;
  link?: string;
}

// Miga de pan accesible: <nav aria-label="Miga de pan"> con una lista ordenada; el último paso
// lleva aria-current="page" y los separadores son decorativos (aria-hidden), así el lector de
// pantalla lee solo los nombres. La usan el catálogo y el detalle de producto
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  templateUrl: './breadcrumbs.html',
  styleUrl: './breadcrumbs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumbs {
  readonly items = input.required<readonly BreadcrumbItem[]>();
}
