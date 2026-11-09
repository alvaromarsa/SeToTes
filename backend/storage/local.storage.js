const fs = require('node:fs/promises');
const path = require('node:path');

const { publicBaseUrl } = require('../config/env');

// Almacenamiento en disco: backend/uploads/products/<key>-<variant>.webp,
// servido por express.static en /uploads (ver app.js)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const PRODUCTS_DIR = path.join(UPLOADS_DIR, 'products');
const VARIANTS = ['large', 'card'];

function fileName(key, variant) {
  return `${key}-${variant}.webp`;
}

async function save(key, variant, buffer) {
  await fs.mkdir(PRODUCTS_DIR, { recursive: true });
  await fs.writeFile(path.join(PRODUCTS_DIR, fileName(key, variant)), buffer);
}

// Borra todas las variantes; no falla si alguna ya no existe
async function remove(key) {
  await Promise.all(
    VARIANTS.map((variant) =>
      fs.rm(path.join(PRODUCTS_DIR, fileName(key, variant)), { force: true })
    )
  );
}

function publicUrl(key, variant) {
  return `${publicBaseUrl}/uploads/products/${fileName(key, variant)}`;
}

module.exports = { UPLOADS_DIR, save, remove, publicUrl };
