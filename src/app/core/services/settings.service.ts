import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, map, Observable, of, shareReplay, tap } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type { StoreSettings } from '@core/models/store-settings.models';

// Si no se pueden cargar los ajustes, la tienda sigue funcionando con esto (sin errores visibles):
// un texto general en vez de un plazo que podría no ser cierto, y sin aviso
const FALLBACK_SETTINGS: StoreSettings = {
  shippingTimeText: 'Consulta los plazos de entrega en las condiciones',
  announcementText: '',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly publicUrl = `${API_BASE_URL}/api/settings/public`;
  private readonly adminUrl = `${API_BASE_URL}/api/admin/settings`;

  // Una sola petición por carga de la web, compartida por todos los componentes
  private readonly loadedSettings$ = this.http.get<StoreSettings>(this.publicUrl).pipe(
    catchError((error: unknown) => {
      // Contenido secundario: no se muestra ningún error, solo se registra
      console.error('No se pudieron cargar los ajustes de la tienda; se usan los de respaldo', error);
      return of(FALLBACK_SETTINGS);
    }),
    shareReplay(1),
  );

  // Lo que el admin acaba de guardar sustituye a lo cargado, sin esperar a la caché de 60 s
  private readonly savedSettingsSubject = new BehaviorSubject<StoreSettings | null>(null);

  readonly settings$: Observable<StoreSettings> = combineLatest([
    this.loadedSettings$,
    this.savedSettingsSubject.asObservable(),
  ]).pipe(map(([loaded, saved]) => saved ?? loaded));

  // Administración: valores actuales (sin caché pública)
  getAdminSettings(): Observable<StoreSettings> {
    return this.http.get<StoreSettings>(this.adminUrl, { withCredentials: true });
  }

  updateAdminSettings(settings: StoreSettings): Observable<StoreSettings> {
    return this.http
      .put<StoreSettings>(this.adminUrl, settings, { withCredentials: true })
      .pipe(tap((saved) => this.savedSettingsSubject.next(saved)));
  }
}
