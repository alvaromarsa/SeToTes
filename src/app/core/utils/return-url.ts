import type { Router, UrlTree } from '@angular/router';

export const RETURN_URL_PARAM = 'returnUrl';

// Solo rutas internas: evita redirecciones abiertas a otros dominios
// ("//evil.com" o "https://evil.com" saldrían de la tienda)
export function isSafeReturnUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.includes('://') &&
    // "/\evil.com": algunos navegadores tratan la barra invertida como "//"
    !url.startsWith('/\\')
  );
}

// /login?returnUrl=... para volver a donde estaba el usuario tras iniciar sesión.
// No se guarda el propio /login (evita volver al login tras iniciar sesión).
export function loginUrlTree(router: Router, returnUrl?: string): UrlTree {
  const queryParams =
    isSafeReturnUrl(returnUrl) && !returnUrl.startsWith('/login') ? { [RETURN_URL_PARAM]: returnUrl } : {};

  return router.createUrlTree(['/login'], { queryParams });
}
