import type { ProductCategory } from '@core/services/product.service';

export interface CategoryInfo {
  tag: string;
  title: string;
  // Sufijo de la clase del bloque de color que sustituye a la foto (ver catalog.css)
  imageClass: string;
}

// TEMPORAL (paso 5 del plan de categorías): aún lo usan el detalle de producto, la portada y la
// gestión de productos. El catálogo y la navbar ya leen las categorías de CategoryService.
export const CATEGORY_INFO: Record<ProductCategory, CategoryInfo> = {
  bolsas: { tag: 'Colección', title: 'Bolsas', imageClass: 'beige' },
  neceseres: { tag: 'Organización', title: 'Neceseres', imageClass: 'sand' },
  fundas: { tag: 'Protección', title: 'Fundas', imageClass: 'graphite' },
  telas: { tag: 'Materiales', title: 'Telas', imageClass: 'linen' },
};

// Todas las categorías viven en /categoria/<slug> (las URL antiguas /bolsas… redirigen aquí).
// Los enlaces internos usan SIEMPRE esta función, nunca la URL antigua
export function categoryPath(slug: string): string {
  return `/categoria/${slug}`;
}
