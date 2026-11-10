import { HttpErrorResponse } from '@angular/common/http';

// Mismo código que ACCOUNT_BLOCKED_CODE en backend/middleware/auth.js
export const ACCOUNT_BLOCKED_CODE = 'ACCOUNT_BLOCKED';

export function isAccountBlockedError(error: unknown): error is HttpErrorResponse {
  return error instanceof HttpErrorResponse && error.status === 403 && error.error?.code === ACCOUNT_BLOCKED_CODE;
}

const CONNECTION_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
const SERVER_ERROR_MESSAGE = 'Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.';

// Traductor único de errores HTTP a un texto para el usuario.
// - 4xx: el backend envía mensajes pensados para el usuario ("Ya existe una cuenta con ese email").
// - 5xx: siempre un texto genérico; nunca se muestra lo que diga el servidor.
// - fallback: texto propio de cada pantalla cuando no hay nada mejor que decir.
export function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  // Sin respuesta: servidor caído, sin conexión o petición bloqueada por el navegador
  if (error.status === 0) {
    return CONNECTION_ERROR_MESSAGE;
  }

  if (error.status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }

  if (error.status >= 400) {
    const serverMessage: unknown = error.error?.message;
    return typeof serverMessage === 'string' && serverMessage.trim() !== '' ? serverMessage : fallback;
  }

  return fallback;
}
