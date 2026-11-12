import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/admin-panel/admin-panel').then((m) => m.AdminPanel),
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/product-management/product-management').then(
        (m) => m.ProductManagement,
      ),
  },
  {
    path: 'orders',
    loadComponent: () =>
      import('./pages/order-management/order-management').then(
        (m) => m.OrderManagement,
      ),
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./pages/user-management/user-management').then(
        (m) => m.UserManagement,
      ),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/store-settings/store-settings').then(
        (m) => m.StoreSettingsPage,
      ),
  },
  {
    path: 'orders/:id',
    loadComponent: () =>
      import('./pages/order-management-detail/order-management-detail').then(
        (m) => m.OrderManagementDetail,
      ),
  },
];
