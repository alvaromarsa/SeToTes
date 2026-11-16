// Producción (ng build): Express sirve el frontend y la API desde el mismo origen, así que
// la URL base es relativa (vacía): las peticiones van a /api/... del propio dominio.
export const environment = {
  apiBaseUrl: '',
};
