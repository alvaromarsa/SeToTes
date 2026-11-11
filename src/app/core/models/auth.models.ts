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

export interface AuthUser {
  id: number;
  full_name: string;
  phone: string;
  email: string;
  created_at: string;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  role: 'customer' | 'admin';
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export interface MessageResponse {
  message: string;
}

export interface LogoutResponse {
  message: string;
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
