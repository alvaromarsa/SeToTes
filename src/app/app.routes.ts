import { Routes } from '@angular/router';

import { BolsasComponent } from './features/bolsas/bolsas.component';
import { FundasComponent } from './features/fundas/fundas.component';
import { NeceseresComponent } from './features/neceseres/neceseres.component';
import { TelasComponent } from './features/telas/telas.component';
import { HomeComponent } from './features/home/home';

export const routes: Routes = [
  { path: '', redirectTo: 'bolsas', pathMatch: 'full' },
  { path: 'bolsas', component: BolsasComponent },
  { path: 'neceseres', component: NeceseresComponent },
  { path: 'fundas', component: FundasComponent },
  { path: 'telas', component: TelasComponent },
  { path: 'home', component: HomeComponent },
];
