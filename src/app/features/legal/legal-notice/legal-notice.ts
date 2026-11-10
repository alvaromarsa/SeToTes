import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LEGAL_CONFIG } from '@core/config/legal.config';
import { LegalPage } from '@shared/components/legal-page/legal-page';

@Component({
  selector: 'app-legal-notice',
  imports: [LegalPage, RouterLink],
  templateUrl: './legal-notice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalNotice {
  readonly legal = LEGAL_CONFIG;
}
