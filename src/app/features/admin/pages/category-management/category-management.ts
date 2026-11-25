import {
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Category } from '@core/models/category.models';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { FormUtils } from '@shared/utils/form-utils';
import { plainTextLength } from '@shared/utils/plain-text';

// Mismos límites que el backend (utils/categories.js), que es quien manda y vuelve a validarlo
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 40;

// Fila de la lista: la categoría (de la lista compartida) con su número de productos
interface CategoryRow extends Category {
  productCount: number | null;
}

// Mismo recorte que el servidor (parseCategoryName): extremos y espacios repetidos
function normalizeName(value: string): string {
  return value.replace(/ {2,}/g, ' ').trim();
}

// /adminpanel/categories: crear y renombrar categorías (borrar llegará en el paso siguiente)
@Component({
  selector: 'app-category-management',
  imports: [ReactiveFormsModule, RouterLink],
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

  readonly formUtils = FormUtils;
  readonly status = this.categoryService.status;
  readonly nameMaxLength = NAME_MAX_LENGTH;

  // Contadores de GET /api/admin/categories (id → productos). Los nombres salen de la lista
  // compartida: así crear y renombrar se reflejan aquí igual que en la navbar
  private readonly productCounts = signal<ReadonlyMap<number, number> | null>(null);
  readonly countsError = signal(false);

  readonly rows = computed<CategoryRow[]>(() => {
    const counts = this.productCounts();
    return this.categoryService
      .categories()
      .map((category) => ({ ...category, productCount: counts?.get(category.id) ?? (counts ? 0 : null) }));
  });

  // --- Crear ---
  // Texto plano de una línea: el servidor lo vuelve a validar y lo guarda recortado
  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [plainTextLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })]],
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
  // Error junto a la fila en edición (del formulario o de la API: 400/409, mensajes en español)
  readonly renameError = signal('');
  // Éxito de renombrar, en la zona role="status" de la lista
  readonly listMessage = signal('');

  constructor() {
    this.categoryService.load();
    this.loadCounts();

    // Al escribir de nuevo, el error anterior del servidor deja de aplicar
    this.categoryForm.controls.name.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.serverError.set(''));
    this.renameControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.renameError.set(''));
  }

  productCountLabel(count: number): string {
    return count === 1 ? '1 producto' : `${count} productos`;
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

    this.isSaving.set(true);
    this.successMessage.set('');
    this.serverError.set('');

    this.categoryService.create(this.categoryForm.controls.name.value).subscribe({
      next: (created) => {
        this.categoryForm.reset();
        this.isSaving.set(false);
        // Recién creada: 0 productos
        this.productCounts.update((counts) => (counts ? new Map(counts).set(created.id, 0) : counts));
        this.successMessage.set(
          `Categoría «${created.name}» creada. Ya aparece en la navbar y en el formulario de productos.`,
        );
      },
      error: (error: unknown) => {
        console.error('No se pudo crear la categoría:', error);
        // 400 (nombre no válido o reservado) y 409 (ya existe) traen un mensaje claro de la API
        this.serverError.set(getErrorMessage(error, 'No se pudo crear la categoría.'));
        this.isSaving.set(false);
        // El foco vuelve al campo, para corregir el nombre y reintentar
        focusAfterRender(this.injector, () => this.nameInput().nativeElement);
      },
    });
  }

  startRename(category: Category): void {
    if (this.isRenaming()) {
      return;
    }

    // Solo una fila a la vez: abrir otra descarta la edición anterior sin guardarla
    this.editingId.set(category.id);
    this.renameControl.reset(category.name);
    this.renameError.set('');
    this.listMessage.set('');
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

    // Sin cambios: no se llama al servidor
    if (name === category.name) {
      this.finishRename(category.id);
      return;
    }

    this.isRenaming.set(true);
    this.renameError.set('');

    this.categoryService.renameCategory(category.id, name).subscribe({
      next: (renamed) => {
        this.isRenaming.set(false);
        this.listMessage.set(`Categoría renombrada a «${renamed.name}». Su dirección no cambia.`);
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
    focusAfterRender(this.injector, () =>
      this.renameButtons()
        .map((button) => button.nativeElement)
        .find((button) => button.dataset['categoryId'] === String(categoryId)),
    );
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
