import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';

// Una foto del visor: la URL de la versión más grande disponible y su texto alternativo
export interface LightboxImage {
  src: string;
  alt: string;
}

// Visor de fotos a pantalla completa con <dialog> nativo: showModal() ya atrapa el foco, cierra
// con Escape y deja inerte el resto de la página. El scroll del fondo lo bloquea styles.css
// (:root:has(.image-lightbox[open])), sin JavaScript ni saltos al cerrar.
// Uso: <app-image-lightbox #lightbox [images]="…" [label]="…" /> y lightbox.open(índice, botón).
@Component({
  selector: 'app-image-lightbox',
  templateUrl: './image-lightbox.html',
  styleUrl: './image-lightbox.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLightbox {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly images = input.required<readonly LightboxImage[]>();
  // Nombre accesible del diálogo, p. ej. «Fotos de Tote roja»
  readonly label = input.required<string>();

  readonly index = signal(0);
  readonly current = computed(() => this.images()[this.index()] ?? null);
  readonly hasSeveral = computed(() => this.images().length > 1);

  private returnFocusTo: HTMLElement | null = null;

  // origin: el botón que lo abre; recupera el foco al cerrar
  open(index: number, origin: HTMLElement): void {
    if (this.images().length === 0) {
      return;
    }

    this.index.set(Math.min(Math.max(index, 0), this.images().length - 1));
    this.returnFocusTo = origin;
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  // Botones y flechas: da la vuelta al llegar a un extremo
  previous(): void {
    const count = this.images().length;
    this.index.update((index) => (index - 1 + count) % count);
  }

  next(): void {
    this.index.update((index) => (index + 1) % this.images().length);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.hasSeveral() || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return;
    }

    event.preventDefault();

    if (event.key === 'ArrowLeft') {
      this.previous();
    } else {
      this.next();
    }
  }

  // Clic fuera de la foto (en el fondo oscuro, no en la foto ni en los botones): cierra
  onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('button')) {
      return;
    }

    if (!(target instanceof HTMLImageElement) || !this.isOnPaintedPhoto(event, target)) {
      this.close();
    }
  }

  // Con object-fit: contain, la caja de la <img> es mayor que la foto pintada (bandas a los lados o
  // arriba y abajo). Un clic en esas bandas es «fuera de la foto». Sin dimensiones aún (cargando),
  // cuenta como dentro
  private isOnPaintedPhoto(event: MouseEvent, image: HTMLImageElement): boolean {
    const { naturalWidth, naturalHeight } = image;

    if (naturalWidth === 0 || naturalHeight === 0) {
      return true;
    }

    const box = image.getBoundingClientRect();
    const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    const left = box.left + (box.width - width) / 2;
    const top = box.top + (box.height - height) / 2;

    return (
      event.clientX >= left && event.clientX <= left + width && event.clientY >= top && event.clientY <= top + height
    );
  }

  // Se cierra con el botón, con Escape o con un clic fuera: el foco vuelve a quien lo abrió
  onClose(): void {
    this.returnFocusTo?.focus();
    this.returnFocusTo = null;
  }
}
