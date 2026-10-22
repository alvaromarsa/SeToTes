import { Routes } from '@angular/router';

import { Catalog } from './features/catalog/catalog';
import { Checkout } from './features/checkout/checkout/checkout';
import { HomeComponent } from './features/home/home';
import { Login } from './features/login/login';
import { Register } from './features/register/register';
import { UserProfile } from './features/user-profile/user-profile';
import { AdminPanel } from './features/admin/pages/admin-panel/admin-panel';
import { ProductManagement } from './features/admin/pages/product-management/product-management';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { Orders } from './features/orders/orders';
import { OrderDetailPage } from './features/order-detail/order-detail';
import { OrderManagement } from './features/admin/pages/order-management/order-management';
import { OrderManagementDetail } from './features/admin/pages/order-management-detail/order-management-detail';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'bolsas', component: Catalog, data: { category: 'bolsas' } },
  { path: 'neceseres', component: Catalog, data: { category: 'neceseres' } },
  { path: 'fundas', component: Catalog, data: { category: 'fundas' } },
  { path: 'telas', component: Catalog, data: { category: 'telas' } },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'user-profile', component: UserProfile, canActivate: [authGuard] },
  { path: 'checkout', component: Checkout, canActivate: [authGuard] },
  { path: 'adminpanel', component: AdminPanel, canActivate: [adminGuard] },
  { path: 'adminpanel/products', component: ProductManagement, canActivate: [adminGuard] },
  { path: 'orders', component: Orders, canActivate: [authGuard] },
  { path: 'orders/:id', component: OrderDetailPage, canActivate: [authGuard] },
  { path: 'adminpanel/orders', component: OrderManagement, canActivate: [adminGuard] },
  { path: 'adminpanel/orders/:id', component: OrderManagementDetail, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'home' }

];
