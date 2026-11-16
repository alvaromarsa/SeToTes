import { environment } from '../../../environments/environment';

// Desarrollo: http://localhost:3000. Producción: '' (mismo origen; Express sirve el frontend).
// Los servicios construyen siempre `${API_BASE_URL}/api/...`
export const API_BASE_URL = environment.apiBaseUrl;

// Prefijo de las peticiones a nuestra API. Los interceptores comprueban este prefijo y no
// API_BASE_URL a secas: en producción API_BASE_URL es '' y cualquier URL empezaría por ''
export const API_URL_PREFIX = `${API_BASE_URL}/api/`;
