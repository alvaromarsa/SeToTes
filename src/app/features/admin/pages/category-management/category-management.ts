import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Category } from '@core/models/category.models';
import { CategoryService } from '@core/services/category.service';
import { ConfirmDialog } from '@shared/components/confirm-dialog/confirm-dialog';
import { getErrorMessage } from '@core/utils/http-error-message';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { FormUtils } from '@shared/utils/form-utils';
import { plainTextLength } from '@shared/utils/plain-text';
import { slugify } from '@shared/utils/slugify';

// Mismos límites que el backend (utils/categories.js), que es quien manda y vuelve a validarlo
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 40;

// Fila de la lista: la categoría (de la lista compartida) con su número de productos, el de sus
// subcategorías (de la lista compartida: se actualiza al momento) y su padre si es subcategoría
interface CategoryRow extends Category {
  productCount: number | null;
  subcategoryCount: number;
  parent: Category | null;
}

// Grupo de la lista: una categoría de primer nivel y sus subcategorías debajo
interface CategoryGroup {
  category: CategoryRow;
  children: CategoryRow[];
}

// Alta de una subcategoría en un padre con productos, pendiente de confirmar en el diálogo
interface PendingMove {
  name: string;
  parent: CategoryRow;
}

// Mismo recorte que el servidor (parseCategoryName): extremos y espacios repetidos
function normalizeName(value: string): string {
  return value.replace(/ {2,}/g, ' ').trim();
}

// /adminpanel/categories: crear (también subcategorías de un nivel, migración 011), renombrar y
// borrar categorías
@Component({
  selector: 'app-category-management',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialog, NgTemplateOutlet],
  templateUrl: './category-management.html',
  styleUrl: './category-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryManagement {
  private readonly categoryService = inject(CategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly renameButtons = viewChildren<ElementRef<HTMLButtonElement>>('renameButton');
  private readonly deleteButtons = viewChildren<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly listHeading = viewChild<ElementRef<HTMLElement>>('listHeading');
  private readonly deleteDialog = viewChild.required<ConfirmDialog>('deleteDialog');
  private readonly moveDialog = viewChild.required<ConfirmDialog>('moveDialog');
  private readonly submitButton = viewChild.required<ElementRef<HTMLButtonElement>>('submitButton');

  readonly formUtils = FormUtils;
  readonly status = this.categoryService.status;
  readonly nameMaxLength = NAME_MAX_LENGTH;

  // Contadores de GET /api/admin/categories (id → productos). Los nombres salen de la lista
  // compartida: así crear y renombrar se reflejan aquí igual que en la navbar
  private readonly productCounts = signal<ReadonlyMap<number, number> | null>(null);
  readonly countsError = signal(false);

  readonly rows = computed<CategoryRow[]>(() => {
    const counts = this.productCounts();
    const categories = this.categoryService.categories();

    return categories.map((category) => ({
      ...category,
      productCount: counts?.get(category.id) ?? (counts ? 0 : null),
      subcategoryCount: categories.filter((item) => item.parentId === category.id).length,
      parent: category.parentId === null ? null : (categories.find((item) => item.id === category.parentId) ?? null),
    }));
  });

  // Lista agrupada: cada categoría de primer nivel con sus subcategorías debajo
  readonly groups = computed<CategoryGroup[]>(() => {
    const rows = this.rows();

    return rows
      .filter((row) => row.parentId === null)
      .map((category) => ({ category, children: rows.filter((row) => row.parentId === category.id) }));
  });

  // Las filas en el orden en que se ven (padre y, debajo, sus hijas): para mover el foco al borrar
  private readonly visibleRows = computed(() =>
    this.groups().flatMap((group) => [group.category, ...group.children]),
  );

  // Opciones de «Dentro de»: solo las de primer nivel (un solo nivel de subcategorías)
  readonly parentOptions = this.categoryService.topLevelCategories;

  // --- Crear ---
  // Texto plano de una línea: el servidor lo vuelve a validar y lo guarda recortado
  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [plainTextLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })]],
    // null = categoría de primer nivel; un id = subcategoría de esa categoría
    parentId: [null as number | null],
  });

  // Subcategoría en un padre con productos: se confirma antes de enviar (se moverán todos)
  readonly pendingMove = signal<PendingMove | null>(null);
  readonly moveDialogMessage = computed(() => {
    const move = this.pendingMove();

    if (!move) {
      return '';
    }

    const count = move.parent.productCount ?? 0;
    return `«${move.parent.name}» tiene ${this.productCountLabel(count)}. Se moverán todos a la nueva subcategoría «${move.name}». ¿Continuar?`;
  });

  readonly isSaving = signal(false);
  readonly successMessage = signal('');
  // Error del servidor (400 o 409): se muestra junto al campo, enlazado con aria-describedby
  readonly serverError = signal('');

  // --- Renombrar (una sola fila a la vez) ---
  readonly editingId = signal<number | null>(null);
  // Un grupo (no un control suelto) para que el <form> de la fila tenga ngSubmit: Enter guarda sin
  // recargar la página
  readonly renameForm = this.fb.nonNullable.group({
    name: ['', [plainTextLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })]],
  });
  private readonly renameControl = this.renameForm.controls.name;
  readonly isRenaming = signal(false);
  // Valor del campo, como signal, para la vista previa de la dirección
  private readonly renameValue = signal('');
  // Vista previa de la dirección que resultará (la genera el servidor con el mismo slugify)
  readonly renamePreview = computed(() => {
    const category = this.categoryService.categories().find((item) => item.id === this.editingId());
    const slug = slugify(normalizeName(this.renameValue()));

    if (!category || slug === '') {
      return 'La dirección (URL) se genera a partir del nombre.';
    }

    return slug === category.slug
      ? `La dirección no cambia: /categoria/${slug}.`
      : `Nueva dirección: /categoria/${slug}. Los enlaces antiguos seguirán funcionando.`;
  });
  // Error junto a la fila en edición (del formulario o de la API: 400/409, mensajes en español)
  readonly renameError = signal('');
  // Éxito de renombrar o borrar, en la zona role="status" de la lista
  readonly listMessage = signal('');

  // --- Borrar ---
  // Categoría pendiente de confirmar en el diálogo
  readonly pendingDelete = signal<CategoryRow | null>(null);
  // Categoría que se está borrando (botones de la lista desactivados mientras tanto)
  readonly deletingId = signal<number | null>(null);
  readonly isDeleting = computed(() => this.deletingId() !== null);
  // Aviso en la fila: «tiene N productos» (sin llamar al servidor) o el error del servidor (409…)
  readonly deleteNotice = signal<{ categoryId: number; message: string } | null>(null);
  readonly deleteDialogTitle = computed(() => {
    const category = this.pendingDelete();
    return `¿Eliminar la ${category?.parent ? 'subcategoría' : 'categoría'} «${category?.name ?? ''}»?`;
  });

  constructor() {
    this.categoryService.load();
    this.loadCounts();

    // Al escribir de nuevo, el error anterior del servidor deja de aplicar
    this.categoryForm.controls.name.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.serverError.set(''));
    this.renameControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.renameError.set('');
      this.renameValue.set(value);
    });
  }

  productCountLabel(count: number): string {
    return count === 1 ? '1 producto' : `${count} productos`;
  }

  subcategoryCountLabel(count: number): string {
    return count === 1 ? '1 subcategoría' : `${count} subcategorías`;
  }

  // Nombre con contexto para los aria-label: «Mochilas (dentro de Bolsas)»
  rowLabel(row: CategoryRow): string {
    return row.parent ? `${row.name} (dentro de ${row.parent.name})` : row.name;
  }

  onSubmit(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      focusAfterRender(this.injector, () => this.nameInput().nativeElement);
      return;
    }

    const parentId = this.categoryForm.controls.parentId.value;
    const parent = parentId === null ? undefined : this.rows().find((row) => row.id === parentId);

    // Primera subcategoría de un padre con productos: antes de enviar, se confirma que se moverán
    // todos a ella. Al cancelar, el diálogo devuelve el foco al botón de crear
    if (parent && parent.subcategoryCount === 0 && (parent.productCount ?? 0) > 0) {
      this.pendingMove.set({ name: normalizeName(this.categoryForm.controls.name.value), parent });
      afterNextRender(() => this.moveDialog().open(this.submitButton().nativeElement), { injector: this.injector });
      return;
    }

    this.createCategory(false);
  }

  onMoveConfirmed(): void {
    this.pendingMove.set(null);
    this.createCategory(true);
  }

  onMoveCancelled(): void {
    this.pendingMove.set(null);
  }

  private createCategory(moveProducts: boolean): void {
    const { name, parentId } = this.categoryForm.getRawValue();
    const parent = parentId === null ? undefined : this.rows().find((row) => row.id === parentId);

    this.isSaving.set(true);
    this.successMessage.set('');
    this.serverError.set('');

    this.categoryService.create(name, { parentId, moveProducts }).subscribe({
      next: (created) => {
        this.categoryForm.reset();
        this.isSaving.set(false);
        // Recién creada: 0 productos, o los que se movieron desde el padre (que se queda sin ninguno)
        this.productCounts.update((counts) => {
          if (!counts) {
            return counts;
          }
          const next = new Map(counts).set(created.id, created.movedProductCount);
          return parent ? next.set(parent.id, 0) : next;
        });

        const moved =
          created.movedProductCount > 0 ? ` Se han movido a ella ${this.productCountLabel(created.movedProductCount)}.` : '';
        this.successMessage.set(
          parent
            ? `Subcategoría «${created.name}» creada dentro de «${parent.name}».${moved}`
            : `Categoría «${created.name}» creada. Ya aparece en la navbar y en el formulario de productos.`,
        );
      },
      error: (error: unknown) => {
        console.error('No se pudo crear la categoría:', error);
        // 400 (nombre no válido o reservado) y 409 (ya existe) traen un mensaje claro de la API
        this.serverError.set(getErrorMessage(error, 'No se pudo crear la categoría.'));
        this.isSaving.set(false);

        // 409 PARENT_HAS_PRODUCTS: alguien añadió productos al padre entre medias. Con los
        // contadores al día, el siguiente intento pedirá confirmación para moverlos
        if (error instanceof HttpErrorResponse && error.error?.code === 'PARENT_HAS_PRODUCTS') {
          this.loadCounts();
        }

        // El foco vuelve al campo, para corregir el nombre y reintentar
        focusAfterRender(this.injector, () => this.nameInput().nativeElement);
      },
    });
  }

  startRename(category: Category): void {
    if (this.isRenaming() || this.isDeleting()) {
      return;
    }

    // Solo una fila a la vez: abrir otra descarta la edición anterior sin guardarla
    this.editingId.set(category.id);
    this.renameControl.reset(category.name);
    this.renameError.set('');
    this.listMessage.set('');
    this.deleteNotice.set(null);
    focusAfterRender(this.injector, () => {
      const input = this.renameInput()?.nativeElement;
      input?.select();
      return input;
    });
  }

  cancelRename(category: Category): void {
    if (this.isRenaming()) {
      return;
    }

    this.finishRename(category.id);
  }

  saveRename(category: Category): void {
    if (this.isRenaming()) {
      return;
    }

    if (this.renameControl.invalid) {
      this.renameControl.markAsTouched();
      this.renameError.set(this.clientRenameError());
      focusAfterRender(this.injector, () => this.renameInput()?.nativeElement);
      return;
    }

    const name = normalizeName(this.renameControl.value);

    // Sin cambios: no se llama al servidor. Salvo si la dirección no corresponde al nombre (categoría
    // renombrada antes de que el slug siguiera al nombre): guardar el mismo nombre la sincroniza
    if (name === category.name && slugify(name) === category.slug) {
      this.finishRename(category.id);
      return;
    }

    this.isRenaming.set(true);
    this.renameError.set('');

    this.categoryService.renameCategory(category.id, name).subscribe({
      next: (renamed) => {
        this.isRenaming.set(false);
        this.listMessage.set(
          renamed.slug === category.slug
            ? `Categoría renombrada a «${renamed.name}». Su dirección no cambia.`
            : `Categoría renombrada a «${renamed.name}». Nueva dirección: /categoria/${renamed.slug}.`,
        );
        this.finishRename(category.id);
      },
      error: (error: unknown) => {
        console.error('No se pudo renombrar la categoría:', error);
        this.renameError.set(getErrorMessage(error, 'No se pudo renombrar la categoría.'));
        this.isRenaming.set(false);
        // El foco vuelve al campo, para corregir el nombre y reintentar
        focusAfterRender(this.injector, () => this.renameInput()?.nativeElement);
      },
    });
  }

  // Cierra la edición y devuelve el foco al botón «Renombrar» de esa fila
  private finishRename(categoryId: number): void {
    this.editingId.set(null);
    this.renameError.set('');
    focusAfterRender(this.injector, () => this.rowButton(this.renameButtons(), categoryId));
  }

  // --- Borrar ---

  // Con productos: no se borra ni se abre el diálogo; se explica en la fila (el botón lleva
  // aria-disabled). Sin productos (o si no se pudo saber): confirmación con el diálogo común
  askDelete(category: CategoryRow, origin: HTMLElement): void {
    if (this.isDeleting() || this.isRenaming()) {
      return;
    }

    this.listMessage.set('');

    if (category.subcategoryCount > 0) {
      this.deleteNotice.set({
        categoryId: category.id,
        message: `No se puede borrar: tiene ${this.subcategoryCountLabel(category.subcategoryCount)}. Bórralas antes.`,
      });
      return;
    }

    if (category.productCount !== null && category.productCount > 0) {
      this.deleteNotice.set({ categoryId: category.id, message: this.blockedMessage(category.productCount) });
      return;
    }

    this.deleteNotice.set(null);
    this.pendingDelete.set(category);
    // Tras pintar el título y el mensaje del diálogo. Al cerrarse (Cancelar o Escape), el
    // propio diálogo devuelve el foco a este botón
    afterNextRender(() => this.deleteDialog().open(origin), { injector: this.injector });
  }

  onDeleteCancelled(): void {
    this.pendingDelete.set(null);
  }

  onDeleteConfirmed(): void {
    const category = this.pendingDelete();
    this.pendingDelete.set(null);

    if (!category || this.isDeleting()) {
      return;
    }

    // Para llevar el foco a la fila siguiente (o la anterior, si era la última), en el orden visible
    const index = this.visibleRows().findIndex((row) => row.id === category.id);
    this.deletingId.set(category.id);

    this.categoryService.deleteCategory(category.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.productCounts.update((counts) => {
          if (!counts) {
            return counts;
          }
          const next = new Map(counts);
          next.delete(category.id);
          return next;
        });
        this.listMessage.set(`Categoría «${category.name}» eliminada.`);

        // Si era la última subcategoría, el padre vuelve a ser una categoría normal (subcategoryCount
        // sale de la lista compartida, que ya no la tiene)
        focusAfterRender(this.injector, () => {
          const rows = this.visibleRows();
          const neighbour = rows[index] ?? rows[index - 1];
          return neighbour ? this.rowButton(this.deleteButtons(), neighbour.id) : this.listHeading()?.nativeElement;
        });
      },
      error: (error: unknown) => {
        console.error('No se pudo borrar la categoría:', error);
        // 409: alguien añadió un producto justo antes (el servidor decide); se muestra su mensaje
        // y se actualizan los contadores
        this.deleteNotice.set({
          categoryId: category.id,
          message: getErrorMessage(error, 'No se pudo borrar la categoría.'),
        });
        this.deletingId.set(null);
        this.loadCounts();
        focusAfterRender(this.injector, () => this.rowButton(this.deleteButtons(), category.id));
      },
    });
  }

  private blockedMessage(productCount: number): string {
    return `No se puede borrar: tiene ${this.productCountLabel(productCount)}. Muévelos a otra categoría o elimínalos antes.`;
  }

  // Botón de una fila concreta (por data-category-id)
  private rowButton(buttons: readonly ElementRef<HTMLButtonElement>[], categoryId: number): HTMLButtonElement | undefined {
    return buttons
      .map((button) => button.nativeElement)
      .find((button) => button.dataset['categoryId'] === String(categoryId));
  }

  private clientRenameError(): string {
    const errors = this.renameControl.errors ?? {};

    return errors['required']
      ? 'Escribe un nombre.'
      : `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres.`;
  }

  private loadCounts(): void {
    this.categoryService.loadAdminCategories().subscribe({
      next: (categories) => {
        this.productCounts.set(new Map(categories.map((category) => [category.id, category.productCount])));
        this.countsError.set(false);
      },
      error: (error: unknown) => {
        // Los nombres siguen viéndose (lista compartida); solo faltan los contadores
        console.error('No se pudieron cargar los contadores de productos:', error);
        this.countsError.set(true);
      },
    });
  }
}
