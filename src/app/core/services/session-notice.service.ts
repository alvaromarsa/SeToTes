import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Aviso de sesión que debe verse en la pantalla de login (por ejemplo, cuenta bloqueada).
// Un servicio en lugar de un parámetro en la URL: no reaparece al recargar ni se queda en el historial.
@Injectable({ providedIn: 'root' })
export class SessionNoticeService {
  private readonly noticeSubject = new BehaviorSubject<string | null>(null);

  readonly notice$ = this.noticeSubject.asObservable();

  show(message: string): void {
    this.noticeSubject.next(message);
  }

  clear(): void {
    this.noticeSubject.next(null);
  }
}
