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

import type { ProductImage } from '@core/models/product-image.models';
import { Product, ProductService, PRODUCT_CATEGORIES, ProductCategory } from '@core/services/product.service';
import { ProductImageManager } from '@features/admin/components/product-image-manager/product-image-manager';
import { FormUtils } from '@shared/utils/form-utils';

type CategoryFilter = ProductCategory | 'all';

@Component({
  selector: 'app-product-management',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, TitleCasePipe, ProductImageManager],
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

  products: Product[] = [];
  errorMessage = '';
  isLoading = true;
  readonly formUtils = FormUtils;
  readonly categories = PRODUCT_CATEGORIES;
  readonly categoryFilters: readonly CategoryFilter[] = ['all', ...PRODUCT_CATEGORIES];
  selectedCategory: CategoryFilter = 'all';
  editingProductId: number | null = null;
  isSaving = false;
  saveSuccessMessage = '';
  saveErrorMessage = '';

  ngOnInit(): void {
    this.productService.getProducts().subscribe({

      next: (products: Product[]) => {
        this.products = products;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        console.error('No se pudieron cargar los productos:', error);
        this.errorMessage = 'No se pudieron cargar los productos.';
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

  get filteredProducts(): Product[] {
    return this.selectedCategory === 'all'
      ? this.products
      : this.products.filter((product) => product.category === this.selectedCategory);
  }

  get editingProduct(): Product | null {
    return this.products.find((product) => product.id === this.editingProductId) ?? null;
  }

  countProducts(filter: CategoryFilter): number {
    return filter === 'all'
      ? this.products.length
      : this.products.filter((product) => product.category === filter).length;
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

  startEditing(product: Product): void {

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
      next: (savedProduct: Product) => {
        if (productId === null) {
          // Tras crear, se sigue editando el producto para poder añadirle imágenes
          this.products = [...this.products, savedProduct];
          this.editingProductId = savedProduct.id;
          this.fillForm(savedProduct);
          this.saveSuccessMessage = 'Producto creado. Ahora puedes añadir sus imágenes.';
        } else {
          this.products = this.products.map((product) =>
            product.id === savedProduct.id ? savedProduct : product
          );
          this.editingProductId = null;
          this.resetForm();
          this.saveSuccessMessage = 'Producto actualizado correctamente.';
        }

        this.isSaving = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo guardar el producto:', error);
        this.saveErrorMessage =
          error.error?.message ?? 'No se pudo guardar el producto.';
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
            mainImage: images.length > 0
              ? { largeUrl: images[0].largeUrl, cardUrl: images[0].cardUrl }
              : null,
          }
        : product
    );
  }

  private fillForm(product: Product): void {
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
