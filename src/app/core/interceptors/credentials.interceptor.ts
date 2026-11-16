import { HttpInterceptorFn } from '@angular/common/http';

import { API_URL_PREFIX } from '../config/api.config';

export const credentialsInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_URL_PREFIX)) {
    return next(request);
  }

  return next(request.clone({ withCredentials: true }));
};
