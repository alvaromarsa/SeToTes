import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';
import { LegalPage } from '@shared/components/legal-page/legal-page';

@Component({
  selector: 'app-privacy',
  imports: [LegalPage, RouterLink],
  templateUrl: './privacy.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Privacy {
  readonly legal = LEGAL_CONFIG;
}
