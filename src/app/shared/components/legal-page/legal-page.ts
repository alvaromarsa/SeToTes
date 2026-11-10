import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { Title } from '@angular/platform-browser';

import { LEGAL_CONFIG } from '@core/config/legal.config';

// Maquetación común de las páginas legales: título, fecha y contenido proyectado.
// ViewEncapsulation.None: los h2, p, ul y tablas los escribe cada página, así que el CSS
// encapsulado normal no les llegaría. Para que no afecte al resto de la tienda,
// TODOS los selectores de legal-page.css empiezan por .legal-page.
@Component({
  selector: 'app-legal-page',
  templateUrl: './legal-page.html',
  styleUrl: './legal-page.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPage implements OnInit, OnDestroy {
  private readonly titleService = inject(Title);
  // Las demás rutas no fijan título: al salir se restaura el original (como en product-detail)
  private readonly originalTitle = this.titleService.getTitle();

  readonly title = input.required<string>();

  readonly lastUpdated = LEGAL_CONFIG.lastUpdated;

  ngOnInit(): void {
    this.titleService.setTitle(`${this.title()} – ${LEGAL_CONFIG.storeName}`);
  }

  ngOnDestroy(): void {
    this.titleService.setTitle(this.originalTitle);
  }
}
