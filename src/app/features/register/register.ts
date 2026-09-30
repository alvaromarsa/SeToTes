import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AuthService, RegisterResponse } from '../../core/services/auth.service';
import { FormUtils } from '../../shared/utils/form-utils';
import { HttpErrorResponse } from '@angular/common/http';

const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  return password === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  readonly formUtils = FormUtils;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly registerForm = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      phone: ['', [Validators.required, Validators.minLength(9)]],
    },
    {
      validators: passwordsMatchValidator,
    },
  );

  submitted = false;

  onSubmit(): void {
    this.submitted = true;

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
    };

    this.authService.register(payload).subscribe({
      next: (response: RegisterResponse) => {
        console.log(response.message);
      },
      error: (error: HttpErrorResponse) => {
        console.error(
          'No se pudo registrar el usuario:',
          error.error?.message ?? error.message
        );
      },
    });
  }
}
