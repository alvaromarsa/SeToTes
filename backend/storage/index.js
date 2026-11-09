// Capa de almacenamiento de imágenes. El resto del backend solo usa
// save(key, variant, buffer), remove(key) y publicUrl(key, variant), y en la
// base de datos solo se guarda la clave. Para pasar a S3/R2 al desplegar basta
// con una implementación nueva con estas mismas funciones y cambiar este require.
//
// TODO: no existe borrado de productos. Si se añade, ON DELETE CASCADE quitará
// las filas de product_images pero no los archivos: habrá que llamar a remove()
// con las claves del producto antes de borrarlo.
module.exports = require('./local.storage');
