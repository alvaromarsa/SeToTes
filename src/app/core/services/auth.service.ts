import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {BehaviorSubject, tap, Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type {
  AuthUser,
  CurrentUserResponse,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
  RegisterResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})

export class AuthService {
  private apiUrl = `${API_BASE_URL}/api/auth`;
  private readonly currentUserSubject =new BehaviorSubject<AuthUser | null>(null);

  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  // El backend deja la sesión iniciada al registrarse (la cookie la envía credentialsInterceptor)
  register(data: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/register`,
      data
    ).pipe(
      tap((response) => this.currentUserSubject.next(response.user))
    );
  }

  login(data: LoginRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/login`,
      data,
      { withCredentials: true }
    ).pipe(
        tap((response) => this.currentUserSubject.next(response.user))
    );
  }

  getCurrentUser(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(
      `${this.apiUrl}/me`,
      { withCredentials: true }
    ).pipe(
        tap((response) => this.currentUserSubject.next(response.user)))
    ;
  }

  logout(): Observable<LogoutResponse> {
    return this.http.post<LogoutResponse>(
      `${this.apiUrl}/logout`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => this.currentUserSubject.next(null)))
    ;
  }

  updateCurrentUser(data: UpdateProfileRequest): Observable<UpdateProfileResponse> {
  return this.http.put<UpdateProfileResponse>(
      `${this.apiUrl}/me`,
      data,
      { withCredentials: true }
    )
    .pipe(
      tap((response) => this.currentUserSubject.next(response.user))
    );
  }

  hasSession(): boolean {
    return this.currentUserSubject.value !== null;
  }

  clearSession(): void {
    this.currentUserSubject.next(null);
  }
}
