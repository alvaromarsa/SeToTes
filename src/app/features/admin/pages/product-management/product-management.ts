import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { CATEGORY_INFO } from '@core/config/categories.config';
import type { AdminProduct } from '@core/models/admin-product.models';
import type { ProductImage } from '@core/models/product-image.models';
import { ProductService, PRODUCT_CATEGORIES, ProductCategory } from '@core/services/product.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { ProductImageManager } from '@features/admin/components/product-image-manager/product-image-manager';
import { VisibilitySwitch } from '@features/admin/components/visibility-switch/visibility-switch';
import { FormUtils } from '@shared/utils/form-utils';

type CategoryFilter = ProductCategory | 'all';
type StatusFilter = 'all' | 'visible' | 'hidden';

@Component({
  selector: 'app-product-management',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, TitleCasePipe, ProductImageManager, VisibilitySwitch],
  templateUrl: './product-management.html',
  styleUrl: './product-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductManagement implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);

  private readonly formPanel = viewChild.required<ElementRef<HTMLElement>>('formPanel');
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly categoryTabs = viewChildren<ElementRef<HTMLButtonElement>>('categoryTab');

  products: AdminProduct[] = [];
  errorMessage = '';
  isLoading = true;
  readonly formUtils = FormUtils;
  readonly categories = PRODUCT_CATEGORIES;
  readonly categoryFilters: readonly CategoryFilter[] = ['all', ...PRODUCT_CATEGORIES];
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
    category: ['bolsas' as ProductCategory, [Validators.required]],
  });

  // El filtro de estado se aplica primero: las pestañas de categoría cuentan sobre él
  get statusFilteredProducts(): AdminProduct[] {
    return this.selectedStatus === 'all'
      ? this.products
      : this.products.filter((product) => product.isVisible === (this.selectedStatus === 'visible'));
  }

  get filteredProducts(): AdminProduct[] {
    return this.selectedCategory === 'all'
      ? this.statusFilteredProducts
      : this.statusFilteredProducts.filter((product) => product.category === this.selectedCategory);
  }

  get emptyFilterMessage(): string {
    const status = { all: '', visible: ' visibles', hidden: ' ocultos' }[this.selectedStatus];

    return this.selectedCategory === 'all'
      ? `No hay productos${status}.`
      : `No hay productos${status} en la categoría «${CATEGORY_INFO[this.selectedCategory].title}».`;
  }

  get editingProduct(): AdminProduct | null {
    return this.products.find((product) => product.id === this.editingProductId) ?? null;
  }

  countProducts(filter: CategoryFilter): number {
    return filter === 'all'
      ? this.statusFilteredProducts.length
      : this.statusFilteredProducts.filter((product) => product.category === filter).length;
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
    const lastIndex = this.categoryFilters.length - 1;
    const currentIndex = this.categoryFilters.indexOf(this.selectedCategory);
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
    this.selectCategory(this.categoryFilters[nextIndex]);
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
      category: product.category,
    });
  }

  private defaultCategory(): ProductCategory {
    return this.selectedCategory === 'all'
      ? this.productForm.controls.category.defaultValue
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
