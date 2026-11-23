import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { retry } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type { Category } from '../models/category.models';

export type CategoriesStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Tonos del recuadro sin foto (clases product-card__image--<tono> de catalog.css). Las categorías
// no tienen color propio: se repiten estos 4 según su posición en la lista
const PLACEHOLDER_TONES = ['beige', 'sand', 'graphite', 'linen'] as const;

// Reintento único si falla la primera carga (p. ej., el backend aún arrancaba)
const RETRY_DELAY_MS = 2000;

// Categorías de la tienda (GET /api/categories), cargadas UNA vez y compartidas por toda la app.
// Si la carga falla (también tras el reintento), la lista queda vacía y status pasa a 'error':
// la navbar se queda sin categorías y no se muestra ningún aviso (contenido secundario).
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/api/categories`;

  private readonly categoriesState = signal<Category[]>([]);
  private readonly statusState = signal<CategoriesStatus>('idle');

  readonly categories = this.categoriesState.asReadonly();
  readonly status = this.statusState.asReadonly();

  // Idempotente: lo llaman la navbar y el catálogo; solo la primera llamada hace la petición
  load(): void {
    if (this.statusState() !== 'idle') {
      return;
    }

    this.statusState.set('loading');

    this.http
      .get<Category[]>(this.apiUrl)
      .pipe(retry({ count: 1, delay: RETRY_DELAY_MS }))
      .subscribe({
        next: (categories) => {
          this.categoriesState.set(categories);
          this.statusState.set('loaded');
        },
        error: (error: unknown) => {
          console.error('No se pudieron cargar las categorías', error);
          this.statusState.set('error');
        },
      });
  }

  findBySlug(slug: string): Category | undefined {
    return this.categoriesState().find((category) => category.slug === slug);
  }

  // Sufijo de clase del recuadro sin foto: los 4 tonos se repiten según la posición en la lista
  placeholderTone(slug: string): (typeof PLACEHOLDER_TONES)[number] {
    const index = this.categoriesState().findIndex((category) => category.slug === slug);
    return PLACEHOLDER_TONES[Math.max(index, 0) % PLACEHOLDER_TONES.length];
  }
}
