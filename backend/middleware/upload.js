const multer = require('multer');

const { MAX_PRODUCT_IMAGES } = require('../config/constants');

const MAX_IMAGE_SIZE_MB = 5;

// En memoria: sharp valida y convierte el contenido antes de escribir nada en disco
const productImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024,
    files: MAX_PRODUCT_IMAGES,
    fields: 0,
  },
}).array('images', MAX_PRODUCT_IMAGES);

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: [413, `Cada imagen puede ocupar como máximo ${MAX_IMAGE_SIZE_MB} MB`],
  LIMIT_FILE_COUNT: [400, `Puedes subir como máximo ${MAX_PRODUCT_IMAGES} imágenes a la vez`],
  LIMIT_UNEXPECTED_FILE: [400, 'Las imágenes deben enviarse en el campo "images"'],
};

function uploadProductImages(request, response, next) {
  productImagesUpload(request, response, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      // multer también usa LIMIT_UNEXPECTED_FILE cuando el campo correcto supera maxCount
      const code =
        error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === 'images'
          ? 'LIMIT_FILE_COUNT'
          : error.code;
      const [status, message] = MULTER_ERRORS[code] ?? [400, 'La subida de imágenes no es válida'];
      return response.status(status).json({ message });
    }

    // Petición multipart mal formada o cortada
    console.error('Error al recibir las imágenes:', error.message);
    return response.status(400).json({
      message: 'No se pudieron recibir las imágenes',
    });
  });
}

module.exports = { uploadProductImages };
