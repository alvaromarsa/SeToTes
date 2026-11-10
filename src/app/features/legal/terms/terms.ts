import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';
import { LegalPage } from '@shared/components/legal-page/legal-page';

@Component({
  selector: 'app-terms',
  imports: [CurrencyPipe, LegalPage, RouterLink],
  templateUrl: './terms.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {
  readonly legal = LEGAL_CONFIG;
}
