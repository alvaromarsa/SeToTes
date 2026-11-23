// Las categorías ya no están en el código: salen de la BD con CategoryService
// (core/services/category.service.ts; GET /api/categories).

// Todas las categorías viven en /categoria/<slug> (las URL antiguas /bolsas… redirigen aquí).
// Los enlaces internos usan SIEMPRE esta función, nunca la URL antigua
export function categoryPath(slug: string): string {
  return `/categoria/${slug}`;
}
