import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { SessionNoticeService } from '@core/services/session-notice.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { passwordsMatchValidator } from '@shared/utils/password-validators';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly sessionNoticeService = inject(SessionNoticeService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  private readonly submitButton = viewChild.required<ElementRef<HTMLButtonElement>>('submitButton');

  readonly registerForm = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      phone: ['', [Validators.required, Validators.minLength(9)]],
      // Se envía con el registro: el backend exige acceptPrivacy === true y guarda privacy_accepted_at y privacy_notice_version
      acceptPrivacy: [false, [Validators.requiredTrue]],
    },
    {
      validators: passwordsMatchValidator,
    },
  );

  submitted = false;
  isSubmitting = false;
  // Errores del servidor: email ya registrado (409), datos no válidos (400), sin conexión, 5xx
  formMessage = '';

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.submitted = true;
    this.formMessage = '';

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const formValue = this.registerForm.getRawValue();

    const payload = {
      fullName: formValue.fullName,
      phone: formValue.phone,
      email: formValue.email,
      password: formValue.password,
      acceptPrivacy: true as const,
    };

    this.isSubmitting = true;

    // El backend deja la sesión iniciada: se entra directamente al perfil
    this.authService.register(payload).subscribe({
      next: () => {
        this.sessionNoticeService.show(
          '¡Cuenta creada! Completa tu dirección para agilizar tus compras.',
          'success',
        );
        void this.router.navigateByUrl('/user-profile');
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo registrar el usuario:', error.status, error);
        this.formMessage = getErrorMessage(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.');
        this.isSubmitting = false;
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.submitButton().nativeElement);
      },
    });
  }
}
