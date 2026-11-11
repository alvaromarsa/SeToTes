import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Validador de grupo: los campos password y confirmPassword deben coincidir.
// Lo usan el registro y el restablecimiento de contraseña. Error: passwordMismatch (ver FormUtils).
export const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  return password === confirmPassword ? null : { passwordMismatch: true };
};
