import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { loginUrlTree } from '../utils/return-url';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getCurrentUser().pipe(
    map(({ user }) =>
      user.role === 'admin'
        ? true
        : router.createUrlTree(['/bolsas'])
    ),
    catchError(() => of(loginUrlTree(router, state.url)))
  );
};
