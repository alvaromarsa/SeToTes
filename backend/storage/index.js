// Capa de almacenamiento de imágenes. El resto del backend solo usa
// save(key, variant, buffer), remove(key) y publicUrl(key, variant), y en la base de datos
// solo se guarda la clave (UUID). publicUrl es la ÚNICA función que construye URLs de imagen.
//
// STORAGE_DRIVER elige la implementación (validado en config/env.js):
// - local: disco (desarrollo), servido por el propio backend en /uploads
// - s3:    almacenamiento compatible con S3 (R2, S3, B2, MinIO), servido desde PUBLIC_IMAGES_BASE_URL
//
// Los fallos lanzan StorageError (storage/errors.js), que las rutas traducen a 502.
//
// TODO: no existe borrado de productos. Si se añade, ON DELETE CASCADE quitará
// las filas de product_images pero no los archivos: habrá que llamar a remove()
// con las claves del producto antes de borrarlo.
const { storage } = require('../config/env');

const driver = storage.driver === 's3' ? require('./s3.storage') : require('./local.storage');

module.exports = { ...driver, driverName: storage.driver };
