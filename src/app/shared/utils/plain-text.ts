import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Mismas reglas que backend/utils/plain-text.js: se cuentan caracteres (un emoji cuenta 1, como
// char_length en PostgreSQL) sobre el texto con los saltos normalizados y sin espacios en los
// extremos, que es lo que guarda el servidor. String.length contaría unidades UTF-16.
export function countCharacters(text: string): number {
  return [...text.replace(/\r\n?/g, '\n').trim()].length;
}

// Longitud de un texto plano. Da los mismos errores que Validators.required / maxLength, así
// FormUtils.getFieldError muestra los mensajes de siempre. El servidor vuelve a validarlo.
export function plainTextLength({ min = 0, max }: { min?: number; max: number }): ValidatorFn {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const length = countCharacters(control.value ?? '');

    if (min > 0 && length === 0) {
      return { required: true };
    }

    if (length < min) {
      return { minlength: { requiredLength: min, actualLength: length } };
    }

    if (length > max) {
      return { maxlength: { requiredLength: max, actualLength: length } };
    }

    return null;
  };
}
