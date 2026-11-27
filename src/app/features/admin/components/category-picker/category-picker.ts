import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import type { Category } from '@core/models/category.models';
import { CategoryService } from '@core/services/category.service';

// Categoría de un producto con dos selectores: la categoría (solo de primer nivel) y, si la elegida
// tiene subcategorías, la subcategoría (obligatoria: un producto solo puede ir en una categoría sin
// subcategorías, migración 011). El control del formulario guarda SIEMPRE el slug de la «hoja»:
// - categoría sin subcategorías → su slug;
// - subcategoría elegida → el slug de la subcategoría;
// - categoría con subcategorías y aún sin subcategoría → '' (el required del control da el error).
// Al editar, un producto en una subcategoría trae los dos selectores ya elegidos.
@Component({
  selector: 'app-category-picker',
  imports: [RouterLink],
  templateUrl: './category-picker.html',
  styleUrl: './category-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryPicker implements OnInit {
  private readonly categoryService = inject(CategoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly control = input.required<FormControl<string>>();
  // El formulario se ha intentado enviar (o el campo se ha tocado) y el valor no vale
  readonly showError = input(false);

  readonly categories = this.categoryService.topLevelCategories;
  readonly categoriesFailed = computed(() => this.categoryService.status() === 'error');
  readonly noCategories = computed(
    () => this.categoryService.status() === 'loaded' && this.categories().length === 0,
  );

  // Valor del control (slug de la hoja, o '')
  private readonly value = signal('');
  // Categoría con subcategorías elegida mientras aún no hay subcategoría (el control vale '')
  private readonly pendingParent = signal('');
  // Para distinguir los cambios que hace este componente de los que llegan de fuera (editar, reset)
  private writing = false;

  private readonly leaf = computed(() => this.categoryService.findBySlug(this.value()));

  readonly selectedTop = computed(() => {
    const leaf = this.leaf();

    if (!leaf) {
      return this.pendingParent();
    }

    return (this.categoryService.parentOf(leaf) ?? leaf).slug;
  });

  readonly selectedSub = computed(() => {
    const leaf = this.leaf();
    return leaf && leaf.parentId !== null ? leaf.slug : '';
  });

  readonly subcategories = computed<Category[]>(() => {
    const top = this.categoryService.findBySlug(this.selectedTop());
    return top ? this.categoryService.subcategoriesOf(top.id) : [];
  });

  readonly errorMessage = computed(() => {
    if (!this.showError()) {
      return '';
    }

    return this.selectedTop() === '' ? 'Elige una categoría.' : 'Elige una subcategoría.';
  });

  ngOnInit(): void {
    const control = this.control();

    control.valueChanges.pipe(startWith(control.value), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.value.set(value);

      if (this.writing) {
        return;
      }

      // Valor puesto desde fuera: vacío (reset) olvida la categoría a medias; una categoría CON
      // subcategorías (p. ej. la de la pestaña elegida) no vale como valor: se deja elegida y se
      // pide la subcategoría
      this.pendingParent.set('');
      const category = this.categoryService.findBySlug(value);

      if (category && this.categoryService.subcategoriesOf(category.id).length > 0) {
        this.pendingParent.set(category.slug);
        this.write('', false);
      }
    });
  }

  // Cambiar de categoría limpia la subcategoría
  onTopChange(slug: string): void {
    const category = this.categoryService.findBySlug(slug);

    if (category && this.categoryService.subcategoriesOf(category.id).length > 0) {
      this.pendingParent.set(slug);
      this.write('');
    } else {
      this.pendingParent.set('');
      this.write(slug);
    }
  }

  onSubChange(slug: string): void {
    this.write(slug);
  }

  onBlur(): void {
    this.control().markAsTouched();
  }

  private write(slug: string, dirty = true): void {
    const control = this.control();

    this.writing = true;
    control.setValue(slug);
    this.writing = false;

    if (dirty) {
      control.markAsDirty();
    }
  }
}
