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
// y el de subcategorías (también impiden borrar)
export interface AdminCategory extends Category {
  productCount: number;
  subcategoryCount: number;
}

// POST /api/admin/categories: la categoría creada y cuántos productos se movieron a ella (solo al
// crear la primera subcategoría de un padre con productos, con moveProducts)
export interface CreatedCategory extends Category {
  movedProductCount: number;
}

// Opciones del alta: dentro de qué categoría (null = primer nivel) y si se mueven a la nueva
// subcategoría los productos que tenga el padre
export interface CreateCategoryOptions {
  parentId?: number | null;
  moveProducts?: boolean;
}
