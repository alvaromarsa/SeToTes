const storage = require('../storage');
const { PRODUCT_DESCRIPTION_MAX_LENGTH } = require('../config/constants');
const { normalizePlainText } = require('./plain-text');

// Subconsulta para añadir a un SELECT sobre "products p": las imágenes del
// producto ordenadas, en una sola consulta (sin N+1)
const PRODUCT_IMAGES_SQL = `
  COALESCE(
    (SELECT json_agg(json_build_object('id', pi.id, 'fileKey', pi.file_key)
                     ORDER BY pi.position, pi.id)
     FROM product_images pi
     WHERE pi.product_id = p.id),
    '[]'::json
  ) AS images`;

function formatImage(image) {
  return {
    id: image.id,
    largeUrl: storage.publicUrl(image.fileKey, 'large'),
    cardUrl: storage.publicUrl(image.fileKey, 'card'),
  };
}

// Listado público del catálogo: sin descripción (la tarjeta no la usa y serían hasta
// 2000 caracteres por producto). pg devuelve los numeric como texto: price se convierte a número
function formatProduct(row) {
  const images = row.images.map(formatImage);

  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    stock: row.stock,
    color: row.color,
    category: row.category,
    images,
    mainImage: images.length > 0
      ? { largeUrl: images[0].largeUrl, cardUrl: images[0].cardUrl }
      : null,
  };
}

// Detalle público: añade la descripción (texto plano o null). La fila debe incluir description
function formatProductDetail(row) {
  return {
    ...formatProduct(row),
    description: row.description,
  };
}

// Solo para rutas de administración: detalle + estado de publicación.
// La fila debe incluir description e is_visible.
function formatAdminProduct(row) {
  const product = formatProductDetail(row);

  return {
    ...product,
    isVisible: row.is_visible,
    imagesCount: product.images.length,
  };
}

// Descripción del cuerpo de POST/PUT. Texto plano con saltos de línea, recortado; vacía = NULL.
// undefined = no se envió (el PUT la deja como estaba). Devuelve { provided, value } o { error }.
function parseDescription(value) {
  if (value === undefined) {
    return { provided: false, value: null };
  }

  if (value === null) {
    return { provided: true, value: null };
  }

  const text = normalizePlainText(value, {
    maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH,
    multiline: true,
  });

  if (text === null) {
    return {
      error: `La descripción debe ser texto de ${PRODUCT_DESCRIPTION_MAX_LENGTH} caracteres como máximo`,
    };
  }

  return { provided: true, value: text === '' ? null : text };
}

module.exports = {
  PRODUCT_IMAGES_SQL,
  formatImage,
  formatProduct,
  formatProductDetail,
  formatAdminProduct,
  parseDescription,
};
