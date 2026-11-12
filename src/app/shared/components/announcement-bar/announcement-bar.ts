import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';

import { SettingsService } from '@core/services/settings.service';

// Aviso general de la tienda (ajuste announcementText). Si está vacío no se pinta nada
@Component({
  selector: 'app-announcement-bar',
  imports: [AsyncPipe],
  templateUrl: './announcement-bar.html',
  styleUrl: './announcement-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnnouncementBar {
  readonly announcement$ = inject(SettingsService).settings$.pipe(
    map((settings) => settings.announcementText),
  );
}
