const {
  corsOrigins,
  frontendDistDir,
  isProduction,
  publicBaseUrl,
  storage: storageConfig,
  trustProxy,
} = require('./config/env');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const storage = require('./storage');
const { apiNotFound, errorHandler } = require('./middleware/error-handler');
const { createFrontendRouter } = require('./middleware/frontend');
const { requestLogger } = require('./middleware/request-logger');

const app = express();

// Endpoint para que cron-job.org mantenga despierto el servidor en Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Nº de proxies delante del backend: así request.ip es la IP real (límite de intentos).
// Ver config/env.js: un valor mayor que los proxies reales permite falsear la IP.
app.set('trust proxy', trustProxy);
app.disable('x-powered-by');

// Una línea por petición (sin query string, cookies, cabeceras ni cuerpos). Solo en producción
if (isProduction) {
  app.use(requestLogger);
}

// Cabeceras de seguridad. La API solo devuelve JSON: la CSP no permite cargar nada ni
// mostrarse dentro de un iframe. Cross-Origin-Resource-Policy queda en same-origin para todo
// salvo /uploads, que lo sobrescribe a cross-origin (las imágenes se cargan desde el frontend).
// Solo añade cabeceras a la respuesta: no toca el cuerpo crudo que necesita el webhook.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
}));

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Healthcheck antes de cualquier otra ruta. No pasa por ningún límite de intentos: los
// limitadores están puestos ruta a ruta (login, registro…). Si algún día se añade uno
// global, este endpoint debe quedar fuera.
app.use('/api/health', require('./routes/health.routes'));

// Webhook de Stripe ANTES de express.json(): Stripe firma el cuerpo exacto que envía, y la
// firma solo se puede verificar sobre esos mismos bytes. express.json() lo convertiría en un
// objeto y ya no se podría comprobar. Esta ruta usa express.raw() (cuerpo como Buffer); como
// el cuerpo queda leído, express.json() la ignora. Las peticiones de Stripe no traen
// cabecera Origin, así que el CORS de arriba no les afecta.
app.use('/api/payments', require('./routes/payments.routes'));

// Límite explícito: los cuerpos JSON de la tienda son pequeños (formularios). La subida de
// imágenes usa multer con su propio límite (middleware/upload.js) y el webhook, express.raw (1mb)
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Imágenes subidas, solo con el driver local (con s3 las sirve el proveedor desde
// PUBLIC_IMAGES_BASE_URL). Los nombres son únicos (uuid), así que se pueden cachear para siempre.
// express.static no lista directorios; index: false evita servir index.html.
if (storage.driverName === 'local') {
  app.use('/uploads', express.static(storage.UPLOADS_DIR, {
    index: false,
    dotfiles: 'ignore',
    maxAge: '1y',
    immutable: true,
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      // El frontend está en otro origen (sobrescribe el same-origin de helmet)
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }));
}

app.use('/api/products/:productId/images', require('./routes/product-images.routes'));
app.use('/api/products', require('./routes/products.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/categories', require('./routes/categories.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/cart', require('./routes/cart.routes'));
app.use('/api/orders', require('./routes/orders.routes'));
app.use('/api/admin/orders', require('./routes/admin-orders.routes'));
app.use('/api/admin/products', require('./routes/admin-products.routes'));
app.use('/api/admin/settings', require('./routes/admin-settings.routes'));
app.use('/api/admin/users', require('./routes/admin-users.routes'));

// Cualquier otra ruta /api: 404 en JSON (antes del frontend: una /api desconocida nunca recibe HTML)
app.use('/api', apiNotFound);

// Producción: Express sirve también el build de Angular (mismo origen que la API, un solo
// servicio), con su propia CSP. En desarrollo el frontend lo sirve ng serve en el puerto 4200
if (isProduction) {
  const frontendRouter = createFrontendRouter({
    distDir: frontendDistDir,
    imageBaseUrls: storageConfig.driver === 's3'
      ? [storageConfig.s3.publicImagesBaseUrl]
      : [publicBaseUrl],
  });

  if (frontendRouter) {
    app.use(frontendRouter);
  }
}

// Manejador global de errores (siempre el último)
app.use(errorHandler);

module.exports = app;
