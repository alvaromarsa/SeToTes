import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { STORE_SETTINGS_LIMITS, type StoreSettings } from '@core/models/store-settings.models';
import { SettingsService } from '@core/services/settings.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { FormUtils } from '@shared/utils/form-utils';
import { countCharacters, plainTextLength } from '@shared/utils/plain-text';

@Component({
  selector: 'app-store-settings',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './store-settings.html',
  styleUrl: './store-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreSettingsPage implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);

  // Opcional: el formulario no existe mientras se cargan los ajustes
  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  readonly formUtils = FormUtils;
  readonly limits = STORE_SETTINGS_LIMITS;
  isLoading = true;
  loadError = '';
  isSaving = false;
  successMessage = '';
  saveError = '';

  // Texto plano de una línea; los límites son los del backend, que vuelve a validarlos
  readonly settingsForm = this.fb.nonNullable.group({
    shippingTimeText: ['', [plainTextLength(STORE_SETTINGS_LIMITS.shippingTimeText)]],
    announcementText: ['', [plainTextLength(STORE_SETTINGS_LIMITS.announcementText)]],
  });

  ngOnInit(): void {
    this.settingsService.getAdminSettings().subscribe({
      next: (settings) => {
        this.settingsForm.reset(settings);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        console.error('No se pudieron cargar los ajustes:', error);
        this.loadError = getErrorMessage(error, 'No se pudieron cargar los ajustes. Recarga la página.');
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // Mismo recuento que el servidor (caracteres, sin los espacios de los extremos)
  length(field: keyof StoreSettings): number {
    return countCharacters(this.settingsForm.controls[field].value);
  }

  onSubmit(): void {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.successMessage = '';
    this.saveError = '';

    this.settingsService.updateAdminSettings(this.settingsForm.getRawValue()).subscribe({
      next: (saved) => {
        // Se muestran los valores tal como quedaron guardados (recortados por el servidor)
        this.settingsForm.reset(saved);
        this.successMessage = 'Ajustes guardados. Quien ya tenga la tienda abierta los verá en un minuto como mucho.';
        this.isSaving = false;
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        console.error('No se pudieron guardar los ajustes:', error);
        this.saveError = getErrorMessage(error, 'No se pudieron guardar los ajustes.');
        this.isSaving = false;
        this.cdr.markForCheck();
        // El botón estuvo desactivado durante la petición: se le devuelve el foco para reintentar
        focusAfterRender(this.injector, () => this.submitButton()?.nativeElement);
      },
    });
  }
}
