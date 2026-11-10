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

module.exports = app;
