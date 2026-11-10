import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@core/services/auth.service';
import { SessionNoticeService } from '@core/services/session-notice.service';
import type { LoginRequest, RegisterResponse, CurrentUserResponse } from '@core/models/auth.models';
import { Router, RouterLink } from '@angular/router';

import { FormUtils } from '@shared/utils/form-utils';

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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  submitted = false;
  // Mensaje genérico del formulario (de momento, el aviso de cuenta bloqueada)
  formMessage = '';

  ngOnInit(): void {
    this.sessionNoticeService.notice$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notice) => {
        this.formMessage = notice ?? '';
        this.cdr.markForCheck();
      });

    // El aviso es para esta visita: al salir del login no debe reaparecer más tarde
    this.destroyRef.onDestroy(() => this.sessionNoticeService.clear());
  }

  onSubmit(): void {
    this.submitted = true;
    // Un nuevo intento borra el aviso anterior; si vuelve a fallar, se mostrará otra vez
    this.sessionNoticeService.clear();

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const formValue = this.loginForm.getRawValue();

    const payload: LoginRequest = {
      email: formValue.email,
      password: formValue.password,
    };

    this.authService.login(payload).subscribe({
      next: (response: RegisterResponse) => {
        console.log(response.message);

        this.authService.getCurrentUser().subscribe({
          next: (session: CurrentUserResponse) => {
            void this.router.navigateByUrl('/user-profile');
          },
          error: (error: HttpErrorResponse) => {
              console.error(
                'No se pudo iniciar sesión:',
                error.error?.message ?? error.message
              );
            },
          });
      },
      error: (error: HttpErrorResponse) => {
        console.error(
          'No se pudo iniciar sesión:',
          error.error?.message ?? error.message
        );
      },
    });
  }
}
