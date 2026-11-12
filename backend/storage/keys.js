// Nombre de cada objeto, igual en los dos drivers: products/<uuid>-<variant>.webp.
// key es el UUID guardado en product_images.file_key; nunca un nombre elegido por el usuario.
const PRODUCTS_PREFIX = 'products';
const VARIANTS = ['large', 'card'];

function objectKey(key, variant) {
  return `${PRODUCTS_PREFIX}/${key}-${variant}.webp`;
}

module.exports = { PRODUCTS_PREFIX, VARIANTS, objectKey };
