// Sube al almacenamiento S3 las imágenes guardadas en disco (driver local), con la MISMA clave.
// Se ejecuta a mano, con STORAGE_DRIVER=s3 y sus variables configuradas:
//
//   node scripts/migrate-images-to-storage.js --dry-run   solo lista lo que subiría
//   node scripts/migrate-images-to-storage.js             sube lo que falte
//
// Idempotente: si un objeto ya existe en el almacenamiento, no lo vuelve a subir.
// Nunca borra los archivos locales ni toca la base de datos (las claves ya están en ella).
// Solo imprime nombres de archivo y recuentos: ni credenciales ni configuración.
const fs = require('node:fs/promises');
const path = require('node:path');

const { storage: storageConfig } = require('../config/env');
const { PRODUCTS_PREFIX } = require('../storage/keys');

// Solo los archivos que genera la tienda: <uuid>-<variante>.webp
const FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(large|card)\.webp$/;
const LOCAL_DIR = path.join(__dirname, '..', 'uploads', PRODUCTS_PREFIX);

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (storageConfig.driver !== 's3') {
    console.error('Configura STORAGE_DRIVER=s3 (y sus variables) para ejecutar la migración.');
    process.exitCode = 1;
    return;
  }

  // Después de comprobar el driver: el cliente S3 se crea al cargar el módulo
  const s3Storage = require('../storage/s3.storage');

  let files;
  try {
    files = (await fs.readdir(LOCAL_DIR)).filter((name) => FILE_PATTERN.test(name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No hay carpeta de imágenes locales: nada que migrar.');
      return;
    }
    throw error;
  }

  const summary = { revisadas: files.length, subidas: 0, yaExistian: 0, errores: 0 };
  console.log(`${dryRun ? '[simulación] ' : ''}Imágenes locales encontradas: ${files.length}`);

  // Una a una: son pocas y así un error no frena las demás
  for (const name of files) {
    const [, key, variant] = name.match(FILE_PATTERN);

    try {
      if (await s3Storage.exists(key, variant)) {
        summary.yaExistian += 1;
        continue;
      }

      if (dryRun) {
        console.log(`  subiría: ${name}`);
      } else {
        await s3Storage.save(key, variant, await fs.readFile(path.join(LOCAL_DIR, name)));
        console.log(`  subida: ${name}`);
      }
      summary.subidas += 1;
    } catch (error) {
      summary.errores += 1;
      console.error(`  error con ${name}:`, error.cause?.name ?? error.name, error.cause?.message ?? error.message);
    }
  }

  console.log(
    `${dryRun ? '[simulación] ' : ''}Resumen: ${summary.revisadas} revisadas, ` +
      `${summary.subidas} ${dryRun ? 'se subirían' : 'subidas'}, ${summary.yaExistian} ya existían, ` +
      `${summary.errores} errores. Los archivos locales no se han tocado.`
  );

  if (summary.errores > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('La migración no pudo completarse:', error.message);
  process.exitCode = 1;
});
