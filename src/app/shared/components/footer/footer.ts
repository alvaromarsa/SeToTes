import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  readonly storeName = LEGAL_CONFIG.storeName;
  readonly year = new Date().getFullYear();

  readonly legalLinks = [
    { path: '/aviso-legal', label: 'Aviso legal' },
    { path: '/privacidad', label: 'Privacidad' },
    { path: '/cookies', label: 'Cookies' },
    { path: '/condiciones', label: 'Condiciones de compra' },
    { path: '/envios-devoluciones', label: 'Envíos y devoluciones' },
  ];
}
