// Fallo del almacenamiento (disco o proveedor S3). Las rutas lo traducen a 502 con un
// mensaje genérico; el detalle (cause) solo va a console.error, nunca al cliente.
class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StorageError';
  }
}

module.exports = { StorageError };
