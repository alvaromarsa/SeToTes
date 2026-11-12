const fs = require('node:fs/promises');
const path = require('node:path');

const { publicBaseUrl } = require('../config/env');
const { StorageError } = require('./errors');
const { VARIANTS, objectKey } = require('./keys');

// Driver "local" (desarrollo): backend/uploads/products/<key>-<variant>.webp,
// servido por express.static en /uploads (ver app.js)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function filePath(key, variant) {
  return path.join(UPLOADS_DIR, objectKey(key, variant));
}

async function save(key, variant, buffer) {
  try {
    await fs.mkdir(path.dirname(filePath(key, variant)), { recursive: true });
    await fs.writeFile(filePath(key, variant), buffer);
  } catch (error) {
    throw new StorageError('No se pudo guardar la imagen en disco', error);
  }
}

// Borra todas las variantes; no falla si alguna ya no existe
async function remove(key) {
  try {
    await Promise.all(VARIANTS.map((variant) => fs.rm(filePath(key, variant), { force: true })));
  } catch (error) {
    throw new StorageError('No se pudo borrar la imagen del disco', error);
  }
}

function publicUrl(key, variant) {
  return `${publicBaseUrl}/uploads/${objectKey(key, variant)}`;
}

module.exports = { UPLOADS_DIR, save, remove, publicUrl };
