import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { API_URL_PREFIX } from '../config/api.config';
import { AuthService } from '../services/auth.service';
import { SessionNoticeService } from '../services/session-notice.service';
import { isAccountBlockedError } from '../utils/http-error-message';
import { loginUrlTree } from '../utils/return-url';

const ACCOUNT_BLOCKED_FALLBACK_MESSAGE = 'Tu cuenta está bloqueada. Contacta con la tienda.';

// Gestiona las respuestas que invalidan la sesión: 401 (caducada) y 403 de cuenta bloqueada.
// clearSession() solo limpia el estado local: el backend ya ha borrado la cookie.
export const authErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const sessionNoticeService = inject(SessionNoticeService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !request.url.startsWith(API_URL_PREFIX)) {
        return throwError(() => error);
      }

      const isSessionExpired =
        error.status === 401 &&
        !request.url.endsWith('/api/auth/login') &&
        authService.hasSession();

      // También en el login: el backend responde 403 tras comprobar la contraseña
      const isAccountBlocked = isAccountBlockedError(error);

      if (isSessionExpired) {
        authService.clearSession();

        // Tenía sesión: tras volver a entrar, sigue donde estaba (loginUrlTree valida la URL)
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl(loginUrlTree(router, router.url));
        }
      } else if (isAccountBlocked) {
        authService.clearSession();
        sessionNoticeService.show(error.error?.message ?? ACCOUNT_BLOCKED_FALLBACK_MESSAGE);

        // Sin bucles: si ya está en el login, solo se muestra el aviso
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl('/login');
        }
      }

      return throwError(() => error);
    }),
  );
};
