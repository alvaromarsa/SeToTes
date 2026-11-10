import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '@core/config/api.config';
import type { AdminUser, AdminUserFilters, AdminUserPage, UserRole } from '@core/models/admin-user.models';

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${API_BASE_URL}/api/admin/users`;

  list(filters: AdminUserFilters = {}): Observable<AdminUserPage> {
    let params = new HttpParams();

    // Solo se envían los filtros con valor: el backend rechaza valores vacíos o no válidos
    const search = filters.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (filters.role) {
      params = params.set('role', filters.role);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.page) {
      params = params.set('page', filters.page);
    }
    if (filters.pageSize) {
      params = params.set('pageSize', filters.pageSize);
    }

    return this.http.get<AdminUserPage>(this.apiUrl, { params, withCredentials: true });
  }

  setBlocked(id: number, blocked: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/${id}/block`, { blocked }, { withCredentials: true });
  }

  setRole(id: number, role: UserRole): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/${id}/role`, { role }, { withCredentials: true });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { withCredentials: true });
  }
}
