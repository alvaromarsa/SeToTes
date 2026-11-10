import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';
import { LegalPage } from '@shared/components/legal-page/legal-page';

@Component({
  selector: 'app-cookies',
  imports: [LegalPage, RouterLink],
  templateUrl: './cookies.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cookies {
  readonly legal = LEGAL_CONFIG;
}
