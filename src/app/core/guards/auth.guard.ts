import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { loginUrlTree } from '../utils/return-url';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getCurrentUser().pipe(
    map(() => true),
    // Tras iniciar sesión, el login vuelve a la ruta que se pidió (state.url)
    catchError(() => of(loginUrlTree(router, state.url))),
  );
};
