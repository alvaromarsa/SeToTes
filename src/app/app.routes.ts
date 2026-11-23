import { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

const loadCatalog = () =>
  import('./features/catalog/catalog').then((m) => m.Catalog);

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  // Una sola ruta para todas las categorías (también las que cree el admin)
  { path: 'categoria/:slug', loadComponent: loadCatalog },
  // URL antiguas: redirigen para no romper marcadores ni enlaces compartidos. Los enlaces
  // internos ya usan categoryPath() (/categoria/<slug>) y no pasan por aquí
  { path: 'bolsas', redirectTo: 'categoria/bolsas', pathMatch: 'full' },
  { path: 'neceseres', redirectTo: 'categoria/neceseres', pathMatch: 'full' },
  { path: 'fundas', redirectTo: 'categoria/fundas', pathMatch: 'full' },
  { path: 'telas', redirectTo: 'categoria/telas', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () =>
      import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'producto/:id',
    loadComponent: () =>
      import('./features/product-detail/product-detail').then((m) => m.ProductDetail),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/register/register').then((m) => m.Register),
  },
  {
    path: 'user-profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/user-profile/user-profile').then((m) => m.UserProfile),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/checkout/checkout/checkout').then((m) => m.Checkout),
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/orders').then((m) => m.Orders),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/order-detail/order-detail').then(
        (m) => m.OrderDetailPage,
      ),
  },
  {
    path: 'adminpanel',
    // canMatch: el guard decide antes de descargar el chunk del admin (ver admin.guard.ts)
    canMatch: [adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  // Páginas legales (datos del titular en core/config/legal.config.ts)
  {
    path: 'aviso-legal',
    loadComponent: () =>
      import('./features/legal/legal-notice/legal-notice').then((m) => m.LegalNotice),
  },
  {
    path: 'privacidad',
    loadComponent: () =>
      import('./features/legal/privacy/privacy').then((m) => m.Privacy),
  },
  {
    path: 'cookies',
    loadComponent: () =>
      import('./features/legal/cookies/cookies').then((m) => m.Cookies),
  },
  {
    path: 'condiciones',
    loadComponent: () =>
      import('./features/legal/terms/terms').then((m) => m.Terms),
  },
  {
    path: 'envios-devoluciones',
    loadComponent: () =>
      import('./features/legal/shipping-returns/shipping-returns').then((m) => m.ShippingReturns),
  },
  { path: '**', redirectTo: 'home' },
];
