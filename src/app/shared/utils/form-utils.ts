import { FormGroup } from '@angular/forms';

export class FormUtils {
  static isValidField(form: FormGroup, fieldName: string): boolean {
    const control = form.get(fieldName);

    return !!(control && control.errors && control.touched);
  }

  static getFieldError(form: FormGroup, fieldName: string): string | null {
    const control = form.get(fieldName);

    if (!control) {
      return null;
    }

    const errors = control.errors ?? {};

    for (const key of Object.keys(errors)) {
      switch (key) {
        case 'required':
          return 'Este campo es requerido';
        case 'email':
          return 'Introduce un email válido';
        case 'minlength':
          return `Mínimo de ${errors['minlength'].requiredLength} caracteres`;
        case 'maxlength':
          return `Máximo de ${errors['maxlength'].requiredLength} caracteres`;
        case 'min':
          return `Valor mínimo de ${errors['min'].min}`;
        case 'max':
          return `Valor máximo de ${errors['max'].max}`;
        case 'pattern':
          return 'Formato inválido';
        default:
          return 'Valor no válido';
      }
    }

    return null;
  }

  static isFormError(form: FormGroup, errorName: string): boolean {
    return !!(form.errors && form.errors[errorName] && form.touched);
  }

  static getFormError(form: FormGroup, errorName: string): string | null {
    if (!form.errors || !form.errors[errorName]) {
      return null;
    }

    switch (errorName) {
      case 'passwordMismatch':
        return 'Las contraseñas no coinciden';
      default:
        return 'Error del formulario';
    }
  }
}

