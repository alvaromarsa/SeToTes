const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const express = require('express');
const helmet = require('helmet');

// Frontend de Angular servido por Express en producción, en el mismo origen que la API.
// Se monta DESPUÉS de las rutas /api y de su 404 JSON: una ruta /api nunca llega aquí.
//
// CSP propia (la de /api, "default-src 'none'", rompería la web):
// - script-src 'self': solo los .js del build; ningún script en línea.
// - style-src 'self' + nonce: Angular inserta en tiempo de ejecución etiquetas <style> con los
//   estilos de cada componente. En vez de 'unsafe-inline', cada respuesta de index.html lleva un
//   nonce aleatorio en el atributo ngCspNonce, y Angular se lo pone a esas etiquetas.
// - img-src: el propio origen, blob: (vista previa de las fotos antes de subirlas, en el panel de
//   admin) y el origen de las imágenes (PUBLIC_IMAGES_BASE_URL con s3; PUBLIC_BASE_URL con local).
// - Sin fuentes ni recursos de terceros: el frontend no carga ninguno.

// Nombres con hash del build de Angular: main-ABCD1234.js, chunk-XXXXXXXX.js, styles-XXXXXXXX.css.
// Si el contenido cambia, cambia el nombre: se pueden cachear un año
const HASHED_FILE = /-[A-Z0-9]{8}\.(?:js|css)$/;
const LONG_CACHE = 'public, max-age=31536000, immutable';
// El resto (index.html, favicon.ico): el navegador debe revalidar antes de usar su copia
const NO_CACHE = 'no-cache';

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCspDirectives(imageOrigins) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", (request, response) => `'nonce-${response.locals.cspNonce}'`],
    imgSrc: ["'self'", 'blob:', ...imageOrigins],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };
}

// Devuelve el router del frontend, o null si no hay build (la API sigue funcionando sola).
function createFrontendRouter({ distDir, imageBaseUrls }) {
  const indexPath = path.join(distDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    console.warn('No se encuentra el build del frontend (FRONTEND_DIST_DIR): solo se sirve la API');
    return null;
  }

  // El build no cambia mientras el proceso vive: se lee una vez
  const indexTemplate = fs.readFileSync(indexPath, 'utf8');
  if (!indexTemplate.includes('<app-root>')) {
    throw new Error('El index.html del frontend no contiene <app-root>: no se puede añadir el nonce de la CSP');
  }

  const imageOrigins = [...new Set(imageBaseUrls.map(originOf).filter(Boolean))];
  const router = express.Router();

  // Nonce nuevo en cada respuesta (también en los estáticos, aunque solo lo use index.html)
  router.use((request, response, next) => {
    response.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Sustituye la CSP estricta de la API (helmet global de app.js); el resto de cabeceras se mantienen
  router.use(helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: buildCspDirectives(imageOrigins),
  }));

  function sendIndex(request, response) {
    const html = indexTemplate.replace(
      '<app-root>',
      `<app-root ngCspNonce="${response.locals.cspNonce}">`
    );

    response.set('Cache-Control', NO_CACHE);
    return response.type('html').send(html);
  }

  // /index.html pedido directamente también pasa por aquí: servido como archivo no llevaría nonce
  router.get('/index.html', sendIndex);

  router.use(express.static(distDir, {
    index: false,
    redirect: false,
    dotfiles: 'ignore',
    cacheControl: false,
    setHeaders: (response, filePath) => {
      response.setHeader('Cache-Control', HASHED_FILE.test(filePath) ? LONG_CACHE : NO_CACHE);
    },
  }));

  // Fallback de SPA: las rutas de Angular (/producto/3, /checkout…) devuelven index.html y el
  // router de Angular decide. Solo navegaciones del navegador (Accept con text/html): un .js o
  // .css que no existe (Accept */*) recibe 404 y no un HTML que el navegador no sabría ejecutar
  router.get(/.*/, (request, response, next) => {
    const isApiPath = request.path === '/api' || request.path.startsWith('/api/');
    const wantsHtml = (request.get('accept') ?? '').includes('text/html');

    if (isApiPath || !wantsHtml) {
      return next();
    }

    return sendIndex(request, response);
  });

  return router;
}

module.exports = { createFrontendRouter };
