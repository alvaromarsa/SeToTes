import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, Observable, of, switchMap, tap } from 'rxjs';

import { categoryPath } from '@core/config/categories.config';
import { CartService } from '@core/services/cart.service';
import { CategoryService } from '@core/services/category.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { loginUrlTree } from '@core/utils/return-url';
import { type BreadcrumbItem, Breadcrumbs } from '@shared/components/breadcrumbs/breadcrumbs';
import { ImageLightbox, type LightboxImage } from '@shared/components/image-lightbox/image-lightbox';
import { ShippingInfo } from '@shared/components/shipping-info/shipping-info';
import { DetailedProduct, ProductService } from '@core/services/product.service';

type LoadResult =
  | { state: 'loaded'; product: DetailedProduct }
  | { state: 'not-found' }
  | { state: 'error' };

type ViewState = LoadResult['state'] | 'loading';

const STORE_NAME = 'SeToTes';
const LOW_STOCK_THRESHOLD = 5;
// El backend no admite más de 99 unidades por petición (routes/cart.routes.js)
const MAX_QUANTITY = 99;

@Component({
  selector: 'app-product-detail',
  imports: [Breadcrumbs, CurrencyPipe, ImageLightbox, ReactiveFormsModule, RouterLink, ShippingInfo],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);
  private readonly categoryService = inject(CategoryService);
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);

  private readonly galleryTrack = viewChild<ElementRef<HTMLElement>>('galleryTrack');
  private readonly thumbnails = viewChildren<ElementRef<HTMLButtonElement>>('thumbnail');
  // Botón de cada foto de la pista (abre el visor)
  private readonly slides = viewChildren<ElementRef<HTMLButtonElement>>('slide');

  // Ninguna otra ruta fija su título: al salir se restaura el original
  private readonly originalTitle = this.titleService.getTitle();

  // Migas de pan, ficha y «Producto no encontrado» con las categorías de la BD
  readonly categories = this.categoryService.categories;
  readonly categoryPath = categoryPath;
  readonly quantityControl = this.fb.nonNullable.control(1);

  viewState: ViewState = 'loading';
  product: DetailedProduct | null = null;
  // Fotos del visor ampliado: la versión «large» (la mayor que guarda el backend) y su alt
  lightboxImages: LightboxImage[] = [];
  activeImageIndex = 0;
  quantityOptions: number[] = [];
  isAdding = false;
  addErrorMessage = '';
  addSuccessMessage = '';

  ngOnInit(): void {
    this.categoryService.load();

    // paramMap (no snapshot): el componente se reutiliza al ir de un producto a otro
    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        tap(() => {
          this.viewState = 'loading';
          this.cdr.markForCheck();
        }),
        switchMap((id) => this.loadProduct(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.viewState = result.state;
        this.product = result.state === 'loaded' ? result.product : null;
        this.lightboxImages = this.buildLightboxImages(this.product);
        this.resetPurchase();

        if (result.state === 'loaded') {
          this.titleService.setTitle(`${result.product.name} – ${STORE_NAME}`);
        } else if (result.state === 'not-found') {
          this.titleService.setTitle(`Producto no encontrado – ${STORE_NAME}`);
        }

        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.titleService.setTitle(this.originalTitle);
  }

  get availability(): { label: string; tone: 'ok' | 'low' | 'out' } | null {
    if (!this.product) {
      return null;
    }

    const { stock } = this.product;

    if (stock === 0) {
      return { label: 'Agotado', tone: 'out' };
    }

    if (stock <= LOW_STOCK_THRESHOLD) {
      return { label: stock === 1 ? 'Última unidad' : `Últimas ${stock} unidades`, tone: 'low' };
    }

    return { label: 'Disponible', tone: 'ok' };
  }

  // focus: qué recibe el foco tras cambiar de foto (la miniatura o el botón de la foto en la pista)
  selectImage(index: number, focus: 'thumbnail' | 'slide' | null = null): void {
    const imageCount = this.product?.images.length ?? 0;

    if (index < 0 || index >= imageCount) {
      return;
    }

    this.activeImageIndex = index;

    const track = this.galleryTrack()?.nativeElement;
    if (track) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({
        left: index * track.clientWidth,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }

    if (focus === 'thumbnail') {
      this.thumbnails()[index]?.nativeElement.focus();
    } else if (focus === 'slide') {
      // preventScroll: el desplazamiento suave de la pista ya la lleva a la vista
      this.slides()[index]?.nativeElement.focus({ preventScroll: true });
    }
  }

  // Al deslizar con el dedo, la foto activa sale de la posición de scroll
  onTrackScroll(): void {
    const track = this.galleryTrack()?.nativeElement;
    if (!track || track.clientWidth === 0) {
      return;
    }

    this.activeImageIndex = Math.round(track.scrollLeft / track.clientWidth);
  }

  onGalleryKeydown(event: KeyboardEvent, fromThumbnails: boolean): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const offset = event.key === 'ArrowLeft' ? -1 : 1;
    this.selectImage(this.activeImageIndex + offset, fromThumbnails ? 'thumbnail' : 'slide');
  }

  addToCart(): void {
    const product = this.product;

    if (!product || product.stock === 0 || this.isAdding) {
      return;
    }

    const quantity = this.quantityControl.value;

    this.isAdding = true;
    this.addErrorMessage = '';
    this.addSuccessMessage = '';

    this.cartService.addItem(product.id, quantity).subscribe({
      next: () => {
        this.addSuccessMessage =
          quantity === 1
            ? 'Se ha añadido 1 unidad al carrito.'
            : `Se han añadido ${quantity} unidades al carrito.`;
        this.isAdding = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.isAdding = false;

        // Sin sesión: tras iniciar sesión vuelve a este producto
        if (error.status === 401) {
          void this.router.navigateByUrl(loginUrlTree(this.router, this.router.url));
          return;
        }

        console.error('Error al añadir al carrito', error.status, error);
        this.addErrorMessage = getErrorMessage(error, 'No se pudo añadir el producto al carrito.');
        this.cdr.markForCheck();
      },
    });
  }

  // Mismo alt que la foto de la pista: «<nombre>, foto N de M»
  private buildLightboxImages(product: DetailedProduct | null): LightboxImage[] {
    if (!product) {
      return [];
    }

    return product.images.map((image, index) => ({
      src: image.largeUrl,
      alt: `${product.name}, foto ${index + 1} de ${product.images.length}`,
    }));
  }

  // catchError dentro del switchMap: un error no corta el flujo de paramMap
  private loadProduct(id: number): Observable<LoadResult> {
    if (!Number.isInteger(id) || id <= 0) {
      return of({ state: 'not-found' });
    }

    return this.productService.getProduct(id).pipe(
      map((product): LoadResult => ({ state: 'loaded', product })),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 404 || error.status === 400) {
          return of<LoadResult>({ state: 'not-found' });
        }

        console.error('No se pudo cargar el producto:', error);
        return of<LoadResult>({ state: 'error' });
      }),
    );
  }

  private resetPurchase(): void {
    const maxQuantity = Math.min(this.product?.stock ?? 0, MAX_QUANTITY);

    this.quantityOptions = Array.from({ length: maxQuantity }, (_, index) => index + 1);
    this.quantityControl.setValue(1);
    this.activeImageIndex = 0;
    this.isAdding = false;
    this.addErrorMessage = '';
    this.addSuccessMessage = '';
  }

  // Enlace a la categoría por su slug ACTUAL (si el producto se cargó antes de un renombrado, el
  // suyo puede ser antiguo; el catálogo también redirigiría, pero así no hace falta)
  categoryLink(slug: string): string {
    return categoryPath(this.categoryService.currentSlug(slug));
  }

  // Migas: Inicio › [padre ›] categoría › producto. Con la categoría de una subcategoría, también
  // su padre (migración 011). Mientras cargan las categorías, el slug
  breadcrumbs(product: DetailedProduct): BreadcrumbItem[] {
    const category = this.categoryService.findBySlug(product.category);
    const parent = category ? this.categoryService.parentOf(category) : undefined;

    return [
      { label: 'Inicio', link: '/home' },
      ...(parent ? [{ label: parent.name, link: categoryPath(parent.slug) }] : []),
      { label: this.categoryName(product.category), link: this.categoryLink(product.category) },
      { label: product.name },
    ];
  }

  // Nombre para mostrar (la BD guarda el slug); mientras cargan las categorías, el slug
  categoryName(slug: string): string {
    return this.categoryService.findBySlug(slug)?.name ?? slug;
  }

  // Recuadro sin foto: tono según la posición de la categoría (los 4 tonos se repiten)
  placeholderTone(slug: string): string {
    return this.categoryService.placeholderTone(slug);
  }
}
