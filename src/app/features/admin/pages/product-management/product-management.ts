import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { Product, ProductService, PRODUCT_CATEGORIES, ProductCategory } from '@core/services/product.service';
import { FormUtils } from '@shared/utils/form-utils';

@Component({
  selector: 'app-product-management',
  imports: [ReactiveFormsModule, RouterLink, TitleCasePipe],
  templateUrl: './product-management.html',
  styleUrl: './product-management.css',
})
export class ProductManagement implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);

  products: Product[] = [];
  errorMessage = '';
  isLoading = true;
  readonly formUtils = FormUtils;
  readonly categories = PRODUCT_CATEGORIES;
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

  startEditing(product: Product): void {

    this.saveSuccessMessage = '';
    this.saveErrorMessage = '';

    this.editingProductId = product.id;

    this.productForm.setValue({
      name: product.name,
      price: Number(product.price),
      stock: Number(product.stock),
      color: product.color ?? '',
      category: product.category,
    });

  }

  cancelEditing(): void {
    this.editingProductId = null;
    this.productForm.reset();
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
          this.products = [...this.products, savedProduct];
          this.saveSuccessMessage = 'Producto creado correctamente.';
        } else {
          this.products = this.products.map((product) =>
            product.id === savedProduct.id ? savedProduct : product
          );
          this.saveSuccessMessage = 'Producto actualizado correctamente.';
        }

        this.editingProductId = null;
        this.productForm.reset();
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
}
