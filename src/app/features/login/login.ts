import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@core/services/auth.service';
import { SessionNoticeService } from '@core/services/session-notice.service';
import type { LoginRequest } from '@core/models/auth.models';
import { getErrorMessage, isAccountBlockedError } from '@core/utils/http-error-message';
import { isSafeReturnUrl, RETURN_URL_PARAM } from '@core/utils/return-url';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { FormUtils } from '@shared/utils/form-utils';
import { focusAfterRender } from '@shared/utils/focus-after-render';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login implements OnInit {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly sessionNoticeService = inject(SessionNoticeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly submitButton = viewChild.required<ElementRef<HTMLButtonElement>>('submitButton');

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  submitted = false;
  isSubmitting = false;
  // Mensaje genérico del formulario: errores del login o avisos de sesión (cuenta bloqueada)
  formMessage = '';
  // Informativo: se ha llegado aquí al intentar algo que necesita sesión
  infoMessage = '';
  private returnUrl: string | null = null;

  ngOnInit(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get(RETURN_URL_PARAM);
    // Un returnUrl no válido (otro dominio, o el propio login) se ignora: tras entrar se va a la home
    this.returnUrl = isSafeReturnUrl(returnUrl) && !returnUrl.startsWith('/login') ? returnUrl : null;
    this.infoMessage = this.returnUrl ? 'Inicia sesión para continuar.' : '';

    this.sessionNoticeService.notice$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notice) => {
        if (notice?.kind === 'error') {
          this.formMessage = notice.message;
          this.cdr.markForCheck();
        }
      });

    // El aviso es para esta visita: al salir del login no debe reaparecer más tarde
    this.destroyRef.onDestroy(() => this.sessionNoticeService.clear('error'));
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.submitted = true;
    // Un nuevo intento borra el aviso anterior; si vuelve a fallar, se mostrará otra vez
    this.formMessage = '';
    this.sessionNoticeService.clear('error');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const formValue = this.loginForm.getRawValue();

    const payload: LoginRequest = {
      email: formValue.email,
      password: formValue.password,
    };

    this.isSubmitting = true;

    this.authService.login(payload).subscribe({
      next: () => {
        // Carga el perfil completo (dirección, etc.) antes de entrar
        this.authService.getCurrentUser().subscribe({
          next: () => {
            void this.router.navigateByUrl(this.returnUrl ?? '/home');
          },
          error: (error: HttpErrorResponse) => this.onLoginError(error),
        });
      },
      error: (error: HttpErrorResponse) => this.onLoginError(error),
    });
  }

  private onLoginError(error: HttpErrorResponse): void {
    console.error('No se pudo iniciar sesión:', error.status, error);
    this.isSubmitting = false;

    // La cuenta bloqueada ya la muestra el interceptor a través de SessionNoticeService
    if (!isAccountBlockedError(error)) {
      // 401: "Email o contraseña incorrectos" (no se distingue si el email existe)
      this.formMessage = getErrorMessage(error, 'No se pudo iniciar sesión. Inténtalo de nuevo.');
    }

    this.cdr.markForCheck();
    focusAfterRender(this.injector, () => this.submitButton().nativeElement);
  }
}
