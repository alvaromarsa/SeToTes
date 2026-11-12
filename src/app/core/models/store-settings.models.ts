// Ajustes de la tienda (/api/settings/public y /api/admin/settings). Los escribe el admin y son
// TEXTO PLANO: se muestran siempre con interpolación, nunca como HTML.
export interface StoreSettings {
  shippingTimeText: string;
  // Vacío = no hay aviso
  announcementText: string;
}

// Límites del formulario de administración (el backend, STORE_SETTINGS en constants.js, es quien manda)
export const STORE_SETTINGS_LIMITS = {
  shippingTimeText: { min: 1, max: 120 },
  announcementText: { min: 0, max: 200 },
} as const;
