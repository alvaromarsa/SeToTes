import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import type { LoginRequest, RegisterResponse, CurrentUserResponse } from '../../core/models/auth.models';
import { Router, RouterLink } from '@angular/router';

import { FormUtils } from '../../shared/utils/form-utils';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [true],
  });

  submitted = false;

  onSubmit(): void {
    this.submitted = true;

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
