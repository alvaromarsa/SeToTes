import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';
import { LegalPage } from '@shared/components/legal-page/legal-page';

@Component({
  selector: 'app-shipping-returns',
  imports: [CurrencyPipe, LegalPage, RouterLink],
  templateUrl: './shipping-returns.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingReturns {
  readonly legal = LEGAL_CONFIG;
}
