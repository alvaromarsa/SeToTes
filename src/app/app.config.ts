import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';
import { credentialsInterceptor } from './core/interceptors/credentials.interceptor';

// Formato español en los pipes (currency, date…): "25,00 €"
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, authErrorInterceptor]),
    ),
    // Página nueva: empieza arriba. Atrás/adelante del navegador: vuelve a donde estaba.
    // anchorScrolling: un enlace con #fragmento baja hasta ese elemento
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    { provide: LOCALE_ID, useValue: 'es' },
  ],
};
