const { corsOrigins } = require('./config/env');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const storage = require('./storage');

const app = express();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Webhook de Stripe ANTES de express.json(): Stripe firma el cuerpo exacto que envía, y la
// firma solo se puede verificar sobre esos mismos bytes. express.json() lo convertiría en un
// objeto y ya no se podría comprobar. Esta ruta usa express.raw() (cuerpo como Buffer); como
// el cuerpo queda leído, express.json() la ignora. Las peticiones de Stripe no traen
// cabecera Origin, así que el CORS de arriba no les afecta.
app.use('/api/payments', require('./routes/payments.routes'));

app.use(express.json());
app.use(cookieParser());

// Imágenes subidas. Los nombres son únicos (uuid), así que se pueden cachear para siempre.
// express.static no lista directorios; index: false evita servir index.html.
app.use('/uploads', express.static(storage.UPLOADS_DIR, {
  index: false,
  dotfiles: 'ignore',
  maxAge: '1y',
  immutable: true,
  setHeaders: (response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // El frontend está en otro origen
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.use('/api/products/:productId/images', require('./routes/product-images.routes'));
app.use('/api/products', require('./routes/products.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/cart', require('./routes/cart.routes'));
app.use('/api/orders', require('./routes/orders.routes'));
app.use('/api/admin/orders', require('./routes/admin-orders.routes'));
app.use('/api/admin/products', require('./routes/admin-products.routes'));
app.use('/api/admin/users', require('./routes/admin-users.routes'));

module.exports = app;
