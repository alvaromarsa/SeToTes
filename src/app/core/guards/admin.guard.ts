import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { loginUrlTree } from '../utils/return-url';

// canMatch (no canActivateChild): se ejecuta ANTES de descargar el código perezoso del admin,
// así un cliente o un visitante sin sesión nunca descarga ese chunk. Siempre devuelve true o un
// UrlTree (nunca false): con false la ruta no coincidiría y caería en '**' (portada).
// Es solo experiencia de usuario: la seguridad real es requireAdmin en el backend.
//   - admin: entra.
//   - sesión sin rol admin: a la portada (/home; no a una categoría concreta, que se puede borrar).
//   - sin sesión (o error al consultar /me): a /login?returnUrl=<la URL pedida> (loginUrlTree
//     solo la añade si pasa isSafeReturnUrl).
export const adminGuard: CanMatchFn = (_route, segments) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // canMatch no recibe RouterStateSnapshot: la URL pedida (con query params, como state.url
  // en canActivate) sale de la navegación en curso; si no la hay, de los segmentos
  const navigation = router.currentNavigation();
  const requestedUrl = navigation
    ? router.serializeUrl(navigation.extractedUrl)
    : `/${segments.map((segment) => segment.path).join('/')}`;

  return authService.getCurrentUser().pipe(
    map(({ user }) =>
      user.role === 'admin'
        ? true
        : router.createUrlTree(['/home'])
    ),
    catchError(() => of(loginUrlTree(router, requestedUrl)))
  );
};
