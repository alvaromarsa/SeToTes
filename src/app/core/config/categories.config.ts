import type { ProductCategory } from '@core/services/product.service';

export interface CategoryInfo {
  tag: string;
  title: string;
  // Sufijo de la clase del bloque de color que sustituye a la foto (ver catalog.css)
  imageClass: string;
}

//Record<ProductCategory, CategoryInfo>. Obliga a que haya una entrada para cada categoría de la lista.
// Si mañana añado 'mochilas' a PRODUCT_CATEGORIES y me olvido de describirla aquí, TypeScript no compila. Es un seguro contra olvidos.
export const CATEGORY_INFO: Record<ProductCategory, CategoryInfo> = {
  bolsas: { tag: 'Colección', title: 'Bolsas', imageClass: 'beige' },
  neceseres: { tag: 'Organización', title: 'Neceseres', imageClass: 'sand' },
  fundas: { tag: 'Protección', title: 'Fundas', imageClass: 'graphite' },
  telas: { tag: 'Materiales', title: 'Telas', imageClass: 'linen' },
};

// Cada categoría tiene su propia ruta en app.routes.ts: /bolsas, /neceseres…
export function categoryPath(category: ProductCategory): string {
  return `/${category}`;
}
