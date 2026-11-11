import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';

// Siempre el mismo texto, exista o no la cuenta (el backend tampoco lo distingue)
const SUCCESS_MESSAGE =
  'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Revisa también la carpeta de spam. El enlace caduca en una hora.';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  // Misma tarjeta que el login
  styleUrl: '../login/login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  isSubmitting = false;
  isSent = false;
  readonly successMessage = SUCCESS_MESSAGE;
  formMessage = '';

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.formMessage = '';

    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    this.authService.forgotPassword(this.forgotForm.getRawValue().email).subscribe({
      next: () => {
        this.isSent = true;
        this.isSubmitting = false;
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo pedir el enlace de recuperación:', error.status, error);
        // 429 (demasiados intentos), email no válido o sin conexión
        this.formMessage = getErrorMessage(error, 'No se pudo enviar el enlace. Inténtalo de nuevo.');
        this.isSubmitting = false;
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.submitButton()?.nativeElement);
      },
    });
  }
}
