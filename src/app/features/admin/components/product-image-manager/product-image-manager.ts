import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import {
  ACCEPTED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_SIZE_MB,
  MAX_PRODUCT_IMAGES,
} from '@core/config/product-images.config';
import type { ProductImage } from '@core/models/product-image.models';
import { ProductImageService } from '@core/services/product-image.service';

interface PendingImage {
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'app-product-image-manager',
  templateUrl: './product-image-manager.html',
  styleUrl: './product-image-manager.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductImageManager implements OnDestroy {
  private readonly productImageService = inject(ProductImageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly productId = input.required<number>();
  readonly productName = input.required<string>();
  readonly images = input.required<ProductImage[]>();
  readonly imagesChange = output<ProductImage[]>();

  readonly maxImages = MAX_PRODUCT_IMAGES;
  readonly maxSizeMb = MAX_PRODUCT_IMAGE_SIZE_MB;
  readonly acceptedTypes = ACCEPTED_PRODUCT_IMAGE_TYPES.join(',');

  pendingImages: PendingImage[] = [];
  validationErrors: string[] = [];
  serverError = '';
  statusMessage = '';
  isDragging = false;
  isUploading = false;
  isReordering = false;
  deletingImageId: number | null = null;
  confirmDeleteImageId: number | null = null;

  constructor() {
    // El componente se reutiliza al pasar de un producto a otro: se descarta lo pendiente
    effect(() => {
      this.productId();
      untracked(() => {
        this.clearPending();
        this.validationErrors = [];
        this.serverError = '';
        this.statusMessage = '';
        this.confirmDeleteImageId = null;
        this.cdr.markForCheck();
      });
    });
  }

  get isBusy(): boolean {
    return this.isUploading || this.isReordering || this.deletingImageId !== null;
  }

  get remainingSlots(): number {
    return this.maxImages - this.images().length - this.pendingImages.length;
  }

  ngOnDestroy(): void {
    this.clearPending();
  }

  onFileInput(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    this.addFiles(Array.from(fileInput.files ?? []));
    // Permite volver a elegir el mismo archivo después de quitarlo
    fileInput.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = this.remainingSlots > 0 && !this.isBusy;
  }

  onDragLeave(): void {
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;

    if (this.remainingSlots > 0 && !this.isBusy) {
      this.addFiles(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  // Validación previa solo para dar respuesta inmediata; el backend vuelve a validarlo todo
  addFiles(files: File[]): void {
    this.validationErrors = [];
    this.serverError = '';
    this.statusMessage = '';

    for (const file of files) {
      if (!ACCEPTED_PRODUCT_IMAGE_TYPES.includes(file.type)) {
        this.validationErrors.push(`«${file.name}»: solo se admiten imágenes JPEG, PNG o WebP.`);
      } else if (file.size > this.maxSizeMb * 1024 * 1024) {
        this.validationErrors.push(`«${file.name}»: ocupa más de ${this.maxSizeMb} MB.`);
      } else if (this.remainingSlots <= 0) {
        this.validationErrors.push(
          `«${file.name}»: no cabe, el máximo es de ${this.maxImages} imágenes por producto.`,
        );
      } else {
        this.pendingImages.push({ file, previewUrl: URL.createObjectURL(file) });
      }
    }
  }

  removePending(pending: PendingImage): void {
    URL.revokeObjectURL(pending.previewUrl);
    this.pendingImages = this.pendingImages.filter((item) => item !== pending);
  }

  clearPending(): void {
    for (const pending of this.pendingImages) {
      URL.revokeObjectURL(pending.previewUrl);
    }
    this.pendingImages = [];
  }

  upload(): void {
    if (this.pendingImages.length === 0 || this.isBusy) {
      return;
    }

    this.isUploading = true;
    this.serverError = '';
    this.statusMessage = '';

    const files = this.pendingImages.map((pending) => pending.file);

    this.productImageService.upload(this.productId(), files).subscribe({
      next: (created) => {
        this.imagesChange.emit([...this.images(), ...created]);
        this.clearPending();
        this.statusMessage =
          created.length === 1 ? 'Imagen subida correctamente.' : `${created.length} imágenes subidas correctamente.`;
        this.isUploading = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudieron subir las imágenes:', error);
        this.serverError = error.error?.message ?? 'No se pudieron subir las imágenes.';
        this.isUploading = false;
        this.cdr.markForCheck();
      },
    });
  }

  move(index: number, offset: -1 | 1): void {
    const targetIndex = index + offset;
    const images = this.images();

    if (this.isBusy || targetIndex < 0 || targetIndex >= images.length) {
      return;
    }

    const imageIds = images.map((image) => image.id);
    [imageIds[index], imageIds[targetIndex]] = [imageIds[targetIndex], imageIds[index]];
    const movedImageId = imageIds[targetIndex];

    this.isReordering = true;
    this.serverError = '';
    this.statusMessage = '';
    this.confirmDeleteImageId = null;

    this.productImageService.reorder(this.productId(), imageIds).subscribe({
      next: (reordered) => {
        this.imagesChange.emit(reordered);
        this.statusMessage =
          targetIndex === 0
            ? 'Imagen movida a la posición 1. Ahora es la principal.'
            : `Imagen movida a la posición ${targetIndex + 1}.`;
        this.isReordering = false;
        this.cdr.markForCheck();
        this.focusMoveButton(movedImageId, offset);
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo cambiar el orden de las imágenes:', error);
        this.serverError = error.error?.message ?? 'No se pudo guardar el orden de las imágenes.';
        this.isReordering = false;
        this.cdr.markForCheck();
      },
    });
  }

  askDelete(imageId: number): void {
    this.confirmDeleteImageId = imageId;
    this.statusMessage = '';
  }

  cancelDelete(): void {
    this.confirmDeleteImageId = null;
  }

  confirmDelete(imageId: number): void {
    if (this.isBusy) {
      return;
    }

    this.deletingImageId = imageId;
    this.serverError = '';

    this.productImageService.remove(this.productId(), imageId).subscribe({
      next: (remaining) => {
        this.imagesChange.emit(remaining);
        this.statusMessage = 'Imagen eliminada.';
        this.deletingImageId = null;
        this.confirmDeleteImageId = null;
        this.cdr.markForCheck();
        // El botón pulsado ya no existe: el foco vuelve al título de la sección
        this.focusAfterRender('.image-manager__title');
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo eliminar la imagen:', error);
        this.serverError = error.error?.message ?? 'No se pudo eliminar la imagen.';
        this.deletingImageId = null;
        this.cdr.markForCheck();
      },
    });
  }

  // Tras mover, el foco sigue a la imagen; si ya no puede moverse en esa dirección, al botón contrario
  private focusMoveButton(imageId: number, offset: -1 | 1): void {
    const direction = offset === -1 ? 'before' : 'after';
    const opposite = offset === -1 ? 'after' : 'before';

    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const button = root.querySelector<HTMLButtonElement>(`[data-move="${imageId}-${direction}"]`);
        const target = button && !button.disabled
          ? button
          : root.querySelector<HTMLButtonElement>(`[data-move="${imageId}-${opposite}"]`);
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }
}
