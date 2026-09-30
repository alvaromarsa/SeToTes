import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  user: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
    created_at: string;
  };
}

@Injectable({
  providedIn: 'root',
})

export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';

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
  );
  }
}
