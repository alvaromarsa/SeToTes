import { Component, OnInit } from '@angular/core';
import { Product, ProductService } from '../../core/services/product.service';

@Component({
  selector: 'app-bolsas',
  standalone: true,
  templateUrl: './bolsas.component.html',
  styleUrl: './bolsas.component.css',
})
export class BolsasComponent implements OnInit {
  products: Product[] = [];

  constructor(private productService: ProductService) {}

    ngOnInit(): void {
      this.productService.getProducts().subscribe({
        next: (products) => {
          this.products = products;
        },
        error: (error) => {
          console.error('No se pudieron cargar los productos', error);
        },
      });
    }
}
