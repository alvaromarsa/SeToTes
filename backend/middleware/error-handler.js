// Ruta /api que no existe: 404 en JSON (sin esto, Express respondería con una página HTML)
function apiNotFound(request, response) {
  return response.status(404).json({
    message: 'No se encontró el recurso',
  });
}

// Último middleware: recoge cualquier error no tratado por las rutas.
// Al cliente solo le llegan mensajes genéricos; el detalle (y el stack) va a console.error.
// Express lo reconoce como manejador de errores por tener 4 parámetros (next es obligatorio).
function errorHandler(error, request, response, next) {
  // Si la respuesta ya empezó a enviarse, solo se puede cortar la conexión
  if (response.headersSent) {
    console.error('Error tras empezar la respuesta:', error);
    return next(error);
  }

  // body-parser: JSON mal formado
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ message: 'El cuerpo de la petición no es un JSON válido' });
  }

  // body-parser: más grande que el límite de express.json() o express.raw()
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ message: 'La petición es demasiado grande' });
  }

  console.error(`Error no controlado en ${request.method} ${request.originalUrl.split('?')[0]}:`, error);
  return response.status(500).json({ message: 'Ha ocurrido un error en el servidor' });
}

module.exports = { apiNotFound, errorHandler };
