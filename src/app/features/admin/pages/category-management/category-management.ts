import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { FormUtils } from '@shared/utils/form-utils';
import { plainTextLength } from '@shared/utils/plain-text';

// Mismos límites que el backend (utils/categories.js), que es quien manda y vuelve a validarlo
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 40;

// /adminpanel/categories: crear categorías (por ahora no se borran, renombran ni reordenan)
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

  readonly formUtils = FormUtils;
  readonly categories = this.categoryService.categories;
  readonly status = this.categoryService.status;
  readonly nameMaxLength = NAME_MAX_LENGTH;

  // Texto plano de una línea: el servidor lo vuelve a validar y lo guarda recortado
  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [plainTextLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })]],
  });

  readonly isSaving = signal(false);
  readonly successMessage = signal('');
  // Error del servidor (400 o 409): se muestra junto al campo, enlazado con aria-describedby
  readonly serverError = signal('');

  constructor() {
    this.categoryService.load();

    // Al escribir de nuevo, el error anterior del servidor deja de aplicar
    this.categoryForm.controls.name.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.serverError.set(''));
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
}
