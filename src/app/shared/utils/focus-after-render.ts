import { afterNextRender, type Injector } from '@angular/core';

// Enfoca un elemento cuando Angular haya pintado el siguiente cambio.
// Uso típico: un botón que estuvo desactivado durante una petición fallida pierde el foco;
// al reactivarse, se le devuelve para que el usuario pueda reintentar sin buscarlo.
export function focusAfterRender(injector: Injector, element: () => HTMLElement | null | undefined): void {
  afterNextRender(() => element()?.focus(), { injector });
}
