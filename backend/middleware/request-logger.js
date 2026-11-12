// Una línea por petición: método, ruta, estado y duración ("GET /api/orders/12 200 34ms").
// La ruta va SIN query string (ahí viajan tokens como el del reset de contraseña) y nunca se
// registran cookies, cabeceras, cuerpos ni emails. El healthcheck no se registra: la
// plataforma lo consulta cada pocos segundos y llenaría el log.
const EXCLUDED_PATHS = ['/api/health'];

function requestLogger(request, response, next) {
  const path = request.originalUrl.split('?')[0];

  if (EXCLUDED_PATHS.includes(path)) {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`${request.method} ${path} ${response.statusCode} ${Math.round(durationMs)}ms`);
  });

  return next();
}

module.exports = { requestLogger };
