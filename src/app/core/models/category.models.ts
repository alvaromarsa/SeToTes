// Categoría tal como la devuelve GET /api/categories (tabla categories, migración 007).
// slug: parte de la URL (/categoria/<slug>) y valor de Product.category; lo genera el servidor
export interface Category {
  id: number;
  slug: string;
  name: string;
  position: number;
}
