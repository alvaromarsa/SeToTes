const {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const { storage: storageConfig } = require('../config/env');
const { StorageError } = require('./errors');
const { VARIANTS, objectKey } = require('./keys');

// Driver "s3": cualquier almacenamiento compatible con S3 (R2, S3, Backblaze B2, MinIO…).
// Los objetos son públicos de lectura por la política del bucket (solo products/*);
// estas credenciales solo pueden escribir y borrar (ver CLAUDE.md, "Almacenamiento").
const { s3 } = storageConfig;

const client = new S3Client({
  endpoint: s3.endpoint,
  region: s3.region,
  forcePathStyle: s3.forcePathStyle,
  credentials: {
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
  },
  // Una llamada colgada no debe retener la petición del cliente
  requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
  maxAttempts: 2,
  // Desde la 3.729 el SDK añade por defecto sumas CRC32 que algunos proveedores compatibles
  // rechazan; solo se envían cuando la operación las exige
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

// Los nombres son únicos (uuid): el navegador y la CDN pueden guardarlos un año sin revalidar
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

async function save(key, variant, buffer) {
  try {
    await client.send(new PutObjectCommand({
      Bucket: s3.bucket,
      Key: objectKey(key, variant),
      Body: buffer,
      // sharp siempre genera WebP (utils/images.js)
      ContentType: 'image/webp',
      CacheControl: CACHE_CONTROL,
    }));
  } catch (error) {
    throw new StorageError('No se pudo subir la imagen al almacenamiento', error);
  }
}

// Borra todas las variantes. DeleteObject de S3 no falla si el objeto no existe.
// Dos DeleteObject en lugar de un DeleteObjects: este último no lo admiten igual todos los proveedores
async function remove(key) {
  try {
    await Promise.all(
      VARIANTS.map((variant) =>
        client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: objectKey(key, variant) }))
      )
    );
  } catch (error) {
    throw new StorageError('No se pudo borrar la imagen del almacenamiento', error);
  }
}

// Solo para el script de migración (scripts/migrate-images-to-storage.js)
async function exists(key, variant) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: objectKey(key, variant) }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return false;
    }
    throw new StorageError('No se pudo consultar el almacenamiento', error);
  }
}

function publicUrl(key, variant) {
  return `${s3.publicImagesBaseUrl}/${objectKey(key, variant)}`;
}

module.exports = { save, remove, exists, publicUrl };
