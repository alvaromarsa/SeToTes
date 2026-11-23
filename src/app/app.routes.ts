import { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

const loadCatalog = () =>
  import('./features/catalog/catalog').then((m) => m.Catalog);

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'bolsas', loadComponent: loadCatalog, data: { category: 'bolsas' } },
  { path: 'neceseres', loadComponent: loadCatalog, data: { category: 'neceseres' } },
  { path: 'fundas', loadComponent: loadCatalog, data: { category: 'fundas' } },
  { path: 'telas', loadComponent: loadCatalog, data: { category: 'telas' } },
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
