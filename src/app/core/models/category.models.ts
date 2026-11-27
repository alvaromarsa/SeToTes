// Categoría tal como la devuelve GET /api/categories (tabla categories, migración 007).
// slug: parte de la URL (/categoria/<slug>) y valor de Product.category; lo genera el servidor
// desde el nombre y cambia al renombrar.
// previousSlugs: sus direcciones antiguas (migración 009), del más reciente al más antiguo; el
// catálogo las redirige a la actual.
// parentId: null en las de primer nivel; el id del padre en las subcategorías (migración 011, un
// solo nivel). La lista llega plana: CategoryService la agrupa
export interface Category {
  id: number;
  slug: string;
  name: string;
  position: number;
  parentId: number | null;
  previousSlugs: string[];
}

// GET /api/admin/categories: con el número de productos (también los ocultos, que impiden borrar)
export interface AdminCategory extends Category {
  productCount: number;
}
