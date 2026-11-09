// Copia para la interfaz de los límites del backend. Quien manda es el backend,
// que rechaza siempre lo que se pase:
// - MAX_PRODUCT_IMAGES: backend/config/constants.js
// - Tamaño y tipos: backend/middleware/upload.js y backend/utils/images.js
export const MAX_PRODUCT_IMAGES = 3;

export const MAX_PRODUCT_IMAGE_SIZE_MB = 5;

export const ACCEPTED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
