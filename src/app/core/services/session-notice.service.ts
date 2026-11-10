import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// error: lo muestra el login (por ejemplo, cuenta bloqueada).
// success: lo muestra el perfil (por ejemplo, bienvenida tras registrarse).
export type SessionNoticeKind = 'error' | 'success';

export interface SessionNotice {
  message: string;
  kind: SessionNoticeKind;
}

// Aviso que una pantalla deja para la siguiente.
// Un servicio en lugar de un parámetro en la URL: no reaparece al recargar ni se queda en el historial.
// Cada pantalla que muestra un tipo de aviso lo borra al salir, para que no reaparezca más tarde.
@Injectable({ providedIn: 'root' })
export class SessionNoticeService {
  private readonly noticeSubject = new BehaviorSubject<SessionNotice | null>(null);

  readonly notice$ = this.noticeSubject.asObservable();

  show(message: string, kind: SessionNoticeKind = 'error'): void {
    this.noticeSubject.next({ message, kind });
  }

  // Con tipo: solo borra el aviso si es de ese tipo (no se pisan avisos de otras pantallas)
  clear(kind?: SessionNoticeKind): void {
    if (!kind || this.noticeSubject.value?.kind === kind) {
      this.noticeSubject.next(null);
    }
  }
}
