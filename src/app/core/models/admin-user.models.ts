// Coinciden con USER_ROLES y USER_STATUSES de backend/config/constants.js
export const USER_ROLES = ['customer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Cliente',
  admin: 'Administrador',
};

export const USER_STATUSES = ['active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Activo',
  blocked: 'Bloqueado',
};

export interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  isBlocked: boolean;
  blockedAt: string | null;
  createdAt: string;
  ordersCount: number;
}

export interface AdminUserPage {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

// Los filtros vacíos no se envían al backend
export interface AdminUserFilters {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
}
