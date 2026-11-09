const storage = require('../storage');

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

// pg devuelve los numeric como texto: price se convierte a número
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

module.exports = { PRODUCT_IMAGES_SQL, formatImage, formatProduct };
