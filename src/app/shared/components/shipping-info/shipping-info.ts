import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { SettingsService } from '@core/services/settings.service';

// Plazo de envío (ajuste shippingTimeText) y, si se pide, enlace a las condiciones.
// Solo en el detalle del producto y (sin enlace) en el resumen del checkout; las tarjetas del
// catálogo no lo muestran
@Component({
  selector: 'app-shipping-info',
  imports: [AsyncPipe, RouterLink],
  templateUrl: './shipping-info.html',
  styleUrl: './shipping-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingInfo {
  readonly showTermsLink = input(true);

  readonly shippingTime$ = inject(SettingsService).settings$.pipe(
    map((settings) => settings.shippingTimeText),
  );
}
