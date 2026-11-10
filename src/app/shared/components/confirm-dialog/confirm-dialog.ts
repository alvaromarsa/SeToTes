import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

// Confirmación con <dialog> nativo: showModal() ya atrapa el foco, cierra con Escape
// y bloquea el resto de la página. Sustituye a window.confirm.
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmar');
  // Acción peligrosa o difícil de deshacer: botón de confirmar en rojo
  readonly danger = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  readonly titleId = `confirm-dialog-title-${nextId}`;
  readonly messageId = `confirm-dialog-message-${nextId++}`;

  private returnFocusTo: HTMLElement | null = null;

  // origin: elemento que recupera el foco al cerrar (normalmente, el botón que abrió el diálogo)
  open(origin?: HTMLElement | null): void {
    this.returnFocusTo = origin ?? (document.activeElement as HTMLElement | null);

    const dialog = this.dialog().nativeElement;
    dialog.returnValue = '';
    dialog.showModal();
  }

  // Se cierra con los botones (form method="dialog") o con Escape (returnValue vacío)
  onClose(): void {
    const isConfirmed = this.dialog().nativeElement.returnValue === 'confirm';

    this.returnFocusTo?.focus();
    this.returnFocusTo = null;

    if (isConfirmed) {
      this.confirmed.emit();
    } else {
      this.cancelled.emit();
    }
  }
}
