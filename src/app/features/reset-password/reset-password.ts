import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { SessionNoticeService } from '@core/services/session-notice.service';
import { getErrorMessage } from '@core/utils/http-error-message';
import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';
import { passwordsMatchValidator } from '@shared/utils/password-validators';

// Mismos límites que backend/config/constants.js (PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH)
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  // Misma tarjeta que el login
  styleUrl: '../login/login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword implements OnInit, OnDestroy {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly authService = inject(AuthService);
  private readonly sessionNoticeService = inject(SessionNoticeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  private readonly submitButton = viewChild<ElementRef<HTMLButtonElement>>('submitButton');

  readonly resetForm = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  // El token solo vive en memoria: se quita de la URL nada más leerlo
  private token: string | null = null;
  // missing: la URL no traía token; checking: preguntando al backend; valid: se muestra el
  // formulario; invalid: usado, caducado o inexistente; error: no se pudo comprobar (conexión, 5xx)
  linkState: 'missing' | 'checking' | 'valid' | 'invalid' | 'error' = 'checking';
  linkErrorMessage = '';
  isSubmitting = false;
  formMessage = '';

  ngOnInit(): void {
    // Sin referrer en las peticiones que salgan de esta página (el token no debe viajar en él)
    this.meta.updateTag({ name: 'referrer', content: 'no-referrer' });

    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.linkState = 'missing';
      return;
    }

    // Fuera del historial y de la barra de direcciones (como history.replaceState)
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { token: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    this.checkLink();
  }

  // Avisa al abrir la página si el enlace ya no vale. El POST de reset lo vuelve a validar,
  // porque el enlace puede gastarse o caducar mientras se escribe la contraseña.
  checkLink(): void {
    if (!this.token) {
      return;
    }

    this.linkState = 'checking';
    this.linkErrorMessage = '';

    this.authService.validateResetToken(this.token).subscribe({
      next: () => {
        this.linkState = 'valid';
        this.cdr.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo comprobar el enlace de recuperación:', error.status);
        // 400: el enlace no vale. Otro error (sin conexión, 429, 5xx) no dice nada del enlace
        if (error.status === 400) {
          this.linkState = 'invalid';
        } else {
          this.linkState = 'error';
          this.linkErrorMessage = getErrorMessage(error, 'No se pudo comprobar el enlace. Inténtalo de nuevo.');
        }
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='referrer'");
  }

  onSubmit(): void {
    if (this.isSubmitting || !this.token) {
      return;
    }

    this.formMessage = '';

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    this.authService.resetPassword(this.token, this.resetForm.getRawValue().password).subscribe({
      next: () => {
        // El backend ha invalidado todas las sesiones, también la de este navegador si la había
        this.authService.clearSession();
        this.sessionNoticeService.show(
          'Tu contraseña se ha cambiado. Inicia sesión con la nueva.',
          'success',
        );
        void this.router.navigateByUrl('/login');
      },
      error: (error: HttpErrorResponse) => {
        console.error('No se pudo restablecer la contraseña:', error.status);
        // 400: "El enlace no es válido o ha caducado"; 429: demasiados intentos
        this.formMessage = getErrorMessage(error, 'No se pudo cambiar la contraseña. Inténtalo de nuevo.');
        this.isSubmitting = false;
        this.cdr.markForCheck();
        focusAfterRender(this.injector, () => this.submitButton()?.nativeElement);
      },
    });
  }
}
