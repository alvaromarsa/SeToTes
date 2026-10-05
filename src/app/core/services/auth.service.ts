import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {BehaviorSubject, tap, Observable } from 'rxjs';

export interface RegisterRequest {
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export interface LogoutResponse {
  message: string;
}

export interface AuthUser {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export interface CurrentUserResponse {
  user: AuthUser;
}
export interface UpdateProfileRequest {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface UpdateProfileResponse {
  message: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root',
})

export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';
  private readonly currentUserSubject =new BehaviorSubject<AuthUser | null>(null);

  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  register(data: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/register`,
      data
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
}
