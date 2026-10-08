import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Product, ProductService } from '../../../../core/services/product.service';
import { FormUtils } from '../../../../shared/utils/form-utils';

@Component({
  selector: 'app-product-management',
  imports: [ReactiveFormsModule, RouterLink],
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
  isCreating = false;
  createSuccessMessage = '';
  createErrorMessage = '';


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
  });

  onSubmit(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

  this.isCreating = true;
  this.createSuccessMessage = '';
  this.createErrorMessage = '';

  const newProduct = this.productForm.getRawValue();

  this.productService.createProduct(newProduct).subscribe({
    next: (createdProduct: Product) => {
      this.products = [...this.products, createdProduct];
      this.productForm.reset();

      this.createSuccessMessage = 'Producto creado correctamente.';
      this.isCreating = false;
      this.cdr.markForCheck();
    },
    error: (error: unknown) => {
      console.error('No se pudo crear el producto:', error);
      this.createErrorMessage = 'No se pudo crear el producto.';
      this.isCreating = false;
      this.cdr.markForCheck();
    },
  });
}
}
