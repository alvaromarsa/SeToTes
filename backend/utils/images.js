const sharp = require('sharp');

const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];

// Contra bombas de descompresión: una imagen pequeña en bytes puede declarar
// dimensiones enormes. 40 MP cubre de sobra cualquier foto de móvil o cámara.
const MAX_INPUT_PIXELS = 40_000_000;
const TOO_MANY_PIXELS_MESSAGE = 'La imagen es demasiado grande: como máximo 40 megapíxeles';

const VARIANT_WIDTHS = {
  large: 1600,
  card: 600,
};

const WEBP_QUALITY = 80;

class ImageError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Detecta el formato por el contenido (no por la extensión ni el mimetype del cliente)
// y devuelve las variantes WebP. Sin keepMetadata/withMetadata, sharp no copia
// EXIF, GPS ni ningún otro metadato a la salida.
async function processProductImage(buffer) {
  const options = { limitInputPixels: MAX_INPUT_PIXELS };
  let metadata;

  try {
    metadata = await sharp(buffer, options).metadata();
  } catch (error) {
    throw new ImageError(
      /pixel limit/i.test(error.message) ? TOO_MANY_PIXELS_MESSAGE : 'Uno de los archivos no es una imagen válida'
    );
  }

  if (!ALLOWED_FORMATS.includes(metadata.format)) {
    throw new ImageError('Solo se admiten imágenes JPEG, PNG o WebP');
  }

  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new ImageError(TOO_MANY_PIXELS_MESSAGE);
  }

  const variants = {};

  try {
    for (const [variant, width] of Object.entries(VARIANT_WIDTHS)) {
      variants[variant] = await sharp(buffer, options)
        .rotate() // aplica la orientación EXIF antes de descartar los metadatos
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    }
  } catch (error) {
    // Cabecera válida pero datos dañados o truncados
    console.error('Error al procesar una imagen:', error.message);
    throw new ImageError('No se pudo procesar una de las imágenes');
  }

  return variants;
}

module.exports = { ImageError, processProductImage };
