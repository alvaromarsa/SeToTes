// Categoría tal como la devuelve GET /api/categories (tabla categories, migración 007).
// slug: parte de la URL (/categoria/<slug>) y valor de Product.category; lo genera el servidor
export interface Category {
  id: number;
  slug: string;
  name: string;
  position: number;
}

// GET /api/admin/categories: con el número de productos (también los ocultos, que impiden borrar)
export interface AdminCategory extends Category {
  productCount: number;
}
