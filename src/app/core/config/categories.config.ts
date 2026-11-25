// Las categorías ya no están en el código: salen de la BD con CategoryService
// (core/services/category.service.ts; GET /api/categories).

// Todas las categorías viven en /categoria/<slug> (las URL antiguas /bolsas… redirigen aquí).
// Los enlaces internos usan SIEMPRE esta función, nunca la URL antigua
export function categoryPath(slug: string): string {
  return `/categoria/${slug}`;
}

// Mismo formato que el servidor (isValidSlug en backend/utils/categories.js). Un slug con otro
// formato no puede existir: el catálogo lo da por no encontrado sin llamar a la API (que daría 400)
const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORY_SLUG_MAX_LENGTH = 60;

export function isValidCategorySlug(slug: string): boolean {
  return slug.length <= CATEGORY_SLUG_MAX_LENGTH && CATEGORY_SLUG_PATTERN.test(slug);
}
