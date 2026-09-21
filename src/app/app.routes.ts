import { Routes } from '@angular/router';

import { BolsasComponent } from './features/bolsas/bolsas.component';
import { FundasComponent } from './features/fundas/fundas.component';
import { HomeComponent } from './features/home/home';
import { Login } from './features/login/login';
import { NeceseresComponent } from './features/neceseres/neceseres.component';
import { Register } from './features/register/register';
import { TelasComponent } from './features/telas/telas.component';
import { UserProfile } from './features/user-profile/user-profile';

export const routes: Routes = [
  { path: '', redirectTo: 'bolsas', pathMatch: 'full' },
  { path: 'bolsas', component: BolsasComponent },
  { path: 'neceseres', component: NeceseresComponent },
  { path: 'fundas', component: FundasComponent },
  { path: 'telas', component: TelasComponent },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'user-profile', component: UserProfile },
];
