import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import type { AdminProduct } from '@core/models/admin-product.models';
import type { ProductImage } from '@core/models/product-image.models';
import { CategoryService } from '@core/services/category.service';
import { PRODUCT_DESCRIPTION_MAX_LENGTH, ProductService } from '@core/services/product.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { ProductImageManager } from '@features/admin/components/product-image-manager/product-image-manager';
import { VisibilitySwitch } from '@features/admin/components/visibility-switch/visibility-switch';
import { FormUtils } from '@shared/utils/form-utils';
import { countCharacters, plainTextLength } from '@shared/utils/plain-text';

// 'all' o el slug de una categoría
type CategoryFilter = string;
type StatusFilter = 'all' | 'visible' | 'hidden';

@Component({
  selector: 'app-product-management',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, ProductImageManager, VisibilitySwitch],
  templateUrl: './product-management.html',
  styleUrl: './product-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductManagement implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);

  private readonly formPanel = viewChild.required<ElementRef<HTMLElement>>('formPanel');
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly categoryTabs = viewChildren<ElementRef<HTMLButtonElement>>('categoryTab');

  products: AdminProduct[] = [];
  errorMessage = '';
  isLoading = true;
  readonly formUtils = FormUtils;
  // Selector, pestañas y contadores salen de las categorías de la BD (CategoryService)
  readonly categories = this.categoryService.categories;
  readonly categoriesFailed = computed(() => this.categoryService.status() === 'error');
  // Cargadas pero ninguna (p. ej. se borraron todas): hay que crear una antes de crear productos
  readonly noCategories = computed(
    () => this.categoryService.status() === 'loaded' && this.categories().length === 0,
  );
  readonly descriptionMaxLength = PRODUCT_DESCRIPTION_MAX_LENGTH;
  readonly categoryFilters = computed<CategoryFilter[]>(() => ['all', ...this.categories().map((category) => category.slug)]);
  selectedCategory: CategoryFilter = 'all';
  readonly statusFilters: readonly { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'visible', label: 'Visibles' },
    { value: 'hidden', label: 'Ocultos' },
  ];
  selectedStatus: StatusFilter = 'all';
  savingVisibilityId: number | null = null;
  // Solo hay entrada para los productos cuyo último cambio de visibilidad falló
  visibilityErrors: Partial<Record<number, string>> = {};
  editingProductId: number | null = null;
  isSaving = false;
  saveSuccessMessage = '';
  saveErrorMessage = '';

  constructor() {
    // reload y no load: si la lista compartida es de antes de un renombrado hecho en otra pestaña,
    // no conocería el slug nuevo de los productos (no-cache + ETag: normalmente, un 304)
    this.categoryService.reload();

    // Las categorías llegan después que el formulario: al llegar, un alta nueva sin tocar toma
    // la categoría por defecto (la primera de la lista, o la de la pestaña elegida)
    effect(() => {
      const firstSlug = this.categories()[0]?.slug;
      const categoryControl = this.productForm.controls.category;

      if (firstSlug && this.editingProductId === null && categoryControl.value === '') {
        categoryControl.setValue(this.defaultCategory());
      }
    });
  }

  ngOnInit(): void {
    this.productService.getAdminProducts().subscribe({

      next: (products: AdminProduct[]) => {
        this.products = products;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        console.error('No se pudieron cargar los productos:', error);
        this.errorMessage = getErrorMessage(error, 'No se pudieron cargar los productos.');
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  readonly productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    color: ['', [Validators.required]],
    // Vacía hasta que cargan las categorías (ver el effect del constructor)
    category: ['', [Validators.required]],
    // Texto plano opcional (saltos de línea permitidos)
    description: ['', [plainTextLength({ max: PRODUCT_DESCRIPTION_MAX_LENGTH })]],
  });

  // Mismo recuento que el servidor (caracteres, sin los espacios de los extremos)
  get descriptionLength(): number {
    return countCharacters(this.productForm.controls.description.value);
  }

  // El filtro de estado se aplica primero: las pestañas de categoría cuentan sobre él
  get statusFilteredProducts(): AdminProduct[] {
    return this.selectedStatus === 'all'
      ? this.products
      : this.products.filter((product) => product.isVisible === (this.selectedStatus === 'visible'));
  }

  get filteredProducts(): AdminProduct[] {
    return this.selectedCategory === 'all'
      ? this.statusFilteredProducts
      : this.statusFilteredProducts.filter((product) => this.isInCategory(product, this.selectedCategory));
  }

  get emptyFilterMessage(): string {
    const status = { all: '', visible: ' visibles', hidden: ' ocultos' }[this.selectedStatus];

    return this.selectedCategory === 'all'
      ? `No hay productos${status}.`
      : `No hay productos${status} en la categoría «${this.categoryName(this.selectedCategory)}».`;
  }

  get editingProduct(): AdminProduct | null {
    return this.products.find((product) => product.id === this.editingProductId) ?? null;
  }

  // Nombre para mostrar (la BD guarda el slug). Si la categoría no está en la lista, el slug
  categoryName(slug: string): string {
    return this.categoryService.findBySlug(slug)?.name ?? slug;
  }

  countProducts(filter: CategoryFilter): number {
    return filter === 'all'
      ? this.statusFilteredProducts.length
      : this.statusFilteredProducts.filter((product) => this.isInCategory(product, filter)).length;
  }

  // Por el slug ACTUAL: un producto con un slug antiguo (cargado antes de un renombrado) sigue en
  // la pestaña de su categoría
  private isInCategory(product: AdminProduct, slug: string): boolean {
    return this.categoryService.currentSlug(product.category) === slug;
  }

  selectStatus(status: StatusFilter): void {
    this.selectedStatus = status;
  }

  setVisibility(product: AdminProduct, isVisible: boolean): void {
    if (this.savingVisibilityId !== null) {
      return;
    }

    this.savingVisibilityId = product.id;
    const errors = { ...this.visibilityErrors };
    delete errors[product.id];
    this.visibilityErrors = errors;

    this.productService.setProductVisibility(product.id, isVisible).subscribe({
      next: (updated) => {
        this.replaceProduct(updated);
        this.savingVisibilityId = null;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cambiar la visibilidad:', error);
        // El 409 (publicar sin imágenes) llega con un mensaje claro del servidor
        this.visibilityErrors = {
          ...this.visibilityErrors,
          [product.id]: getErrorMessage(error, 'No se pudo cambiar la visibilidad del producto.'),
        };
        this.savingVisibilityId = null;
        this.cdr.markForCheck();
      },
    });
  }

  selectCategory(filter: CategoryFilter): void {
    this.selectedCategory = filter;

    // Al crear, la categoría sigue a la pestaña mientras el usuario no la haya cambiado a mano
    const categoryControl = this.productForm.controls.category;
    if (this.editingProductId === null && categoryControl.pristine) {
      categoryControl.setValue(this.defaultCategory());
    }
  }

  // Navegación con teclado del patrón "tabs" de WAI-ARIA: flechas, Inicio y Fin
  onTabKeydown(event: KeyboardEvent): void {
    const filters = this.categoryFilters();
    const lastIndex = filters.length - 1;
    const currentIndex = filters.indexOf(this.selectedCategory);
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
        break;
      case 'ArrowLeft':
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectCategory(filters[nextIndex]);
    this.categoryTabs()[nextIndex]?.nativeElement.focus();
  }

  startEditing(product: AdminProduct): void {

    this.saveSuccessMessage = '';
    this.saveErrorMessage = '';

    this.editingProductId = product.id;
    this.fillForm(product);
    this.revealForm();
  }

  cancelEditing(): void {
    this.editingProductId = null;
    this.resetForm();
    this.saveSuccessMessage = '';
    this.saveErrorMessage = '';
  }

  onSubmit(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.saveSuccessMessage = '';
    this.saveErrorMessage = '';

    const productData = this.productForm.getRawValue();
    const productId = this.editingProductId;

    const request$ =
      productId === null
        ? this.productService.createProduct(productData)
        : this.productService.updateProduct(productId, productData);

    request$.subscribe({
      next: (savedProduct: AdminProduct) => {
        if (productId === null) {
          // Tras crear, se sigue editando el producto para poder añadirle imágenes y publicarlo
          this.products = [...this.products, savedProduct];
          this.editingProductId = savedProduct.id;
          this.fillForm(savedProduct);
          this.saveSuccessMessage =
            'Producto creado como oculto. Añade al menos una imagen y publícalo cuando esté listo';
        } else {
          this.replaceProduct(savedProduct);
          this.editingProductId = null;
          this.resetForm();
          this.saveSuccessMessage = 'Producto actualizado correctamente.';
        }

        this.isSaving = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo guardar el producto:', error);
        this.saveErrorMessage = getErrorMessage(error, 'No se pudo guardar el producto.');
        this.isSaving = false;
        this.cdr.markForCheck();
      },
    });
  }

  // La subida, el borrado y el orden ya se han guardado en el servidor; aquí solo se refleja en la lista
  onImagesChange(productId: number, images: ProductImage[]): void {
    this.products = this.products.map((product) =>
      product.id === productId
        ? {
            ...product,
            images,
            imagesCount: images.length,
            mainImage: images.length > 0
              ? { largeUrl: images[0].largeUrl, cardUrl: images[0].cardUrl }
              : null,
          }
        : product
    );
  }

  private replaceProduct(updated: AdminProduct): void {
    this.products = this.products.map((product) => (product.id === updated.id ? updated : product));
  }

  private fillForm(product: AdminProduct): void {
    this.productForm.reset({
      name: product.name,
      price: product.price,
      stock: product.stock,
      color: product.color ?? '',
      // El slug actual: el selector solo tiene esos (y es el que acepta el servidor)
      category: this.categoryService.currentSlug(product.category),
      description: product.description ?? '',
    });
  }

  // La de la pestaña elegida; con «Todas», la primera de la lista ('' si aún no han cargado)
  private defaultCategory(): string {
    return this.selectedCategory === 'all'
      ? (this.categories()[0]?.slug ?? '')
      : this.selectedCategory;
  }

  private resetForm(): void {
    this.productForm.reset({ category: this.defaultCategory() });
  }

  private revealForm(): void {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // En pantallas anchas el panel es sticky y ya está a la vista, así que el scroll no lo mueve
    this.formPanel().nativeElement.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    this.nameInput().nativeElement.focus({ preventScroll: true });
  }
}
