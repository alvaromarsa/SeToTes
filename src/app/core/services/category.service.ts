import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, retry, tap } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type { AdminCategory, Category } from '../models/category.models';

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
  private readonly adminApiUrl = `${API_BASE_URL}/api/admin/categories`;

  private readonly categoriesState = signal<Category[]>([]);
  private readonly statusState = signal<CategoriesStatus>('idle');

  readonly categories = this.categoriesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  // Solo las de primer nivel (navbar, tonos), en el orden de la lista
  readonly topLevelCategories = computed(() =>
    this.categoriesState().filter((category) => category.parentId === null),
  );

  // Idempotente: lo llaman la navbar y el catálogo; solo la primera llamada hace la petición
  load(): void {
    if (this.statusState() !== 'idle') {
      return;
    }

    this.fetch();
  }

  // Vuelve a pedir la lista (no-cache + ETag: si no cambió, 304 sin cuerpo). La usa el catálogo
  // cuando no encuentra un slug: una pestaña abierta desde antes de un renombrado tiene la lista
  // vieja y no conoce la dirección nueva. Mientras tanto, status vuelve a 'loading'
  reload(): void {
    if (this.statusState() === 'loading') {
      return;
    }

    this.fetch();
  }

  private fetch(): void {
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

  // Solo admin (POST /api/admin/categories). El servidor genera el slug y la posición. La nueva
  // se añade a la lista compartida al momento: la navbar y el selector de productos la ven sin
  // recargar (signal)
  create(name: string): Observable<Category> {
    return this.http.post<Category>(this.adminApiUrl, { name }).pipe(
      tap((created) => {
        this.categoriesState.update((categories) =>
          [...categories.filter((category) => category.slug !== created.slug), created].sort(
            (a, b) => a.position - b.position || a.id - b.id,
          ),
        );
      }),
    );
  }

  // Solo admin: la lista con el número de productos de cada categoría (no se guarda en el servicio:
  // la pantalla de categorías la pide cada vez que se abre, para que los contadores estén al día)
  loadAdminCategories(): Observable<AdminCategory[]> {
    return this.http.get<AdminCategory[]>(this.adminApiUrl);
  }

  // Solo admin (PATCH). Cambia el nombre y, con él, el slug (la URL); el anterior queda en
  // previousSlugs. La respuesta sustituye a la categoría en la lista compartida: la navbar, el
  // catálogo (y su redirección desde la dirección antigua) y los selectores la ven sin recargar
  renameCategory(id: number, name: string): Observable<Category> {
    return this.http.patch<Category>(`${this.adminApiUrl}/${id}`, { name }).pipe(
      tap((renamed) => {
        this.categoriesState.update((categories) =>
          categories.map((category) => (category.id === renamed.id ? renamed : category)),
        );
      }),
    );
  }

  // Solo admin (DELETE; el servidor solo borra categorías sin productos). Al terminar bien, la
  // categoría desaparece de la lista compartida
  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminApiUrl}/${id}`).pipe(
      tap(() => {
        this.categoriesState.update((categories) => categories.filter((category) => category.id !== id));
      }),
    );
  }

  // Por su slug actual o por uno antiguo (previousSlugs): un producto o un enlace guardados antes
  // de un renombrado siguen encontrando su categoría. Un slug pertenece a una sola categoría
  // (garantizado por la BD), así que no hay ambigüedad
  findBySlug(slug: string): Category | undefined {
    return this.categoriesState().find(
      (category) => category.slug === slug || category.previousSlugs.includes(slug),
    );
  }

  findById(id: number): Category | undefined {
    return this.categoriesState().find((category) => category.id === id);
  }

  // Subcategorías de una categoría, en el orden de la lista (vacío si no tiene)
  subcategoriesOf(categoryId: number): Category[] {
    return this.categoriesState().filter((category) => category.parentId === categoryId);
  }

  // Padre de una subcategoría (undefined si es de primer nivel)
  parentOf(category: Category): Category | undefined {
    return category.parentId === null ? undefined : this.findById(category.parentId);
  }

  // Slug actual de la categoría de un slug quizá antiguo (para enlaces y comparaciones). Si no se
  // encuentra, el mismo
  currentSlug(slug: string): string {
    return this.findBySlug(slug)?.slug ?? slug;
  }

  // Sufijo de clase del recuadro sin foto: los 4 tonos se repiten según la posición entre las de
  // primer nivel. Una subcategoría usa el de su padre
  placeholderTone(slug: string): (typeof PLACEHOLDER_TONES)[number] {
    const category = this.findBySlug(slug);
    const root = category ? (this.parentOf(category) ?? category) : undefined;
    const index = this.topLevelCategories().findIndex((item) => item.id === root?.id);
    return PLACEHOLDER_TONES[Math.max(index, 0) % PLACEHOLDER_TONES.length];
  }
}
