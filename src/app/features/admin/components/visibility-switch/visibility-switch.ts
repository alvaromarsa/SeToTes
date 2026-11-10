import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let nextId = 0;

// Solo presentación: el componente padre hace la petición y le pasa el estado y los errores
@Component({
  selector: 'app-visibility-switch',
  templateUrl: './visibility-switch.html',
  styleUrl: './visibility-switch.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisibilitySwitch {
  readonly isVisible = input.required<boolean>();
  readonly imagesCount = input.required<number>();
  readonly productName = input.required<string>();
  readonly isSaving = input(false);
  readonly errorMessage = input('');
  readonly visibilityChange = output<boolean>();

  readonly hintId = `visibility-hint-${nextId++}`;

  // Publicar exige al menos una imagen (el backend lo comprueba igualmente); ocultar siempre se puede
  readonly needsImage = computed(() => !this.isVisible() && this.imagesCount() === 0);
  readonly isDisabled = computed(() => this.isSaving() || this.needsImage());

  toggle(): void {
    if (!this.isDisabled()) {
      this.visibilityChange.emit(!this.isVisible());
    }
  }
}
