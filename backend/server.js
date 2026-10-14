const express = require('express');
const cors = require('cors');
const pool = require('./db');
const argon2 = require('argon2');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const CATEGORIES = ['bolsas', 'neceseres', 'fundas', 'telas'];
const SHIPPING_COST = 7.5;

class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en backend/.env');
}

function requireAuth(request, response, next) {
  const token = request.cookies?.access_token;

  if (!token) {
    return response.status(401).json({
      message: 'Necesitas iniciar sesión',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] }
    );

    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return response.status(401).json({
        message: 'La sesión no es válida',
      });
    }

    request.authenticatedUserId = payload.sub;
    return next();
  } catch {
    return response.status(401).json({
      message: 'La sesión no es válida o ha caducado',
    });
  }
}

async function requireAdmin(request, response, next) {
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [request.authenticatedUserId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return response.status(403).json({
        message: 'No tienes permisos para realizar esta acción',
      });
    }

    return next();
  } catch (error) {
    console.error('Error al comprobar los permisos:', error.message);
    return response.status(500).json({
      message: 'No se pudieron comprobar los permisos',
    });
  }
}

app.get('/api/products', async (request, response) => {
  const { category } = request.query;

  if (category !== undefined && !CATEGORIES.includes(category)) {
    return response.status(400).json({
      message: 'La categoría no es válida',
    });
  }

  try {
   const result =
      category === undefined
        ? await pool.query(
            'SELECT id, name, price, stock, color, category FROM products ORDER BY id'
          )
        : await pool.query(
            `SELECT id, name, price, stock, color, category
             FROM products
             WHERE category = $1
             ORDER BY id`,
            [category]
          );


    response.json(result.rows);
  } catch (error) {
    console.error('Error al consultar productos:', error.message);
    response.status(500).json({
      message: 'No se pudieron cargar los productos',
    });
  }
});

app.post('/api/products', requireAuth, requireAdmin, async (request, response) => {
  const { name, price, stock, color, category } = request.body ?? {};

  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    !CATEGORIES.includes(category) ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (color !== undefined && color !== null && typeof color !== 'string')
  ) {
    return response.status(400).json({
      message: 'Los datos del producto no son válidos',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, stock, color, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, price, stock, color, category`,
      [name.trim(), price, stock, color ?? null, category]
    );

    return response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el producto',
    });
  }
});

app.put('/api/products/:id', requireAuth, requireAdmin, async (request, response) => {
  const productId = Number(request.params.id);
  const { name, price, stock, color, category } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !CATEGORIES.includes(category) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (color !== undefined && color !== null && typeof color !== 'string')
  ) {
    return response.status(400).json({
      message: 'Los datos del producto no son válidos',
    });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, price = $2, stock = $3, color = $4, category = $5
       WHERE id = $6
       RETURNING id, name, price, stock, color, category`,
      [name.trim(), price, stock, color ?? null, category, productId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    return response.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo actualizar el producto',
    });
  }
});

app.post('/api/auth/register', async (request, response) => {
  const { fullName, phone, email, password } = request.body ?? {};

  if (
    typeof fullName !== 'string' ||
    fullName.trim() === '' ||
    typeof phone !== 'string' ||
    phone.trim() === '' ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    return response.status(400).json({
      message: 'Revisa los datos: el nombre, el teléfono y el email son obligatorios; la contraseña debe tener al menos 8 caracteres.',
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password);

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone, email, created_at, role`,
      [fullName.trim(), phone.trim(), normalizedEmail, passwordHash]
    );

    return response.status(201).json({
      message: 'Usuario registrado correctamente',
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return response.status(409).json({
        message: 'Ya existe una cuenta con ese email',
      });
    }

    console.error('Error al registrar usuario:', error.message);
    return response.status(500).json({
      message: 'No se pudo registrar el usuario',
    });
  }
});

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body ?? {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.trim() === '' ||
    password === ''
  ) {
    return response.status(400).json({
      message: 'El email y la contraseña son obligatorios',
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, password_hash, created_at, role
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await argon2.verify(user.password_hash, password))) {
      return response.status(401).json({
        message: 'Email o contraseña incorrectos',
      });
    }

    const token = jwt.sign(
      { sub: String(user.id) },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h',
        algorithm: 'HS256',
      }
    );

    response.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });

    return response.json({
      message: 'Inicio de sesión correcto',
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        created_at: user.created_at,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);
    return response.status(500).json({
      message: 'No se pudo iniciar sesión',
    });
  }
});



app.get('/api/auth/me', requireAuth, async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, address, city, postal_code, created_at, role
       FROM users
       WHERE id = $1`,
      [request.authenticatedUserId]
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        message: 'La sesión no es válida',
      });
    }

    return response.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error al consultar la sesión:', error.message);
    return response.status(500).json({
      message: 'No se pudo comprobar la sesión',
    });
  }
});

app.put('/api/auth/me', requireAuth, async (request, response) => {
  const { fullName, phone, email, address, city, postalCode } =
    request.body ?? {};

  if (
    typeof fullName !== 'string' ||
    fullName.trim() === '' ||
    typeof phone !== 'string' ||
    phone.trim() === '' ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof address !== 'string' ||
    typeof city !== 'string' ||
    typeof postalCode !== 'string' ||
    (postalCode.trim() !== '' && !/^\d{5}$/.test(postalCode.trim()))
  ) {
    return response.status(400).json({
      message: 'Los datos del perfil no son válidos',
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = $1,
           phone = $2,
           email = $3,
           address = $4,
           city = $5,
           postal_code = $6
       WHERE id = $7
       RETURNING id, full_name, phone, email, address, city, postal_code, created_at, role`,
      [
        fullName.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        address.trim() || null,
        city.trim() || null,
        postalCode.trim() || null,
        request.authenticatedUserId,
      ]
    );

    if (result.rows.length === 0) {
      return response.status(401).json({
        message: 'La sesión no es válida',
      });
    }

    return response.json({
      message: 'Perfil actualizado correctamente',
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return response.status(409).json({
        message: 'Ya existe una cuenta con ese email',
      });
    }

    console.error('Error al actualizar el perfil:', error.message);
    return response.status(500).json({
      message: 'No se pudo actualizar el perfil',
    });
  }
});

app.post('/api/auth/logout', (request, response) => {
  response.clearCookie('access_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return response.json({
    message: 'Sesión cerrada correctamente',
  });
});

// ---------- CARRITO ----------

app.get('/api/cart', requireAuth, async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT p.id AS product_id, p.name, p.color, p.category,
              p.price, p.stock, ci.quantity,
              (p.price * ci.quantity) AS line_total
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at`,
      [request.authenticatedUserId]
    );

    const items = result.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      color: row.color,
      category: row.category,
      price: Number(row.price),
      stock: row.stock,
      quantity: row.quantity,
      lineTotal: Number(row.line_total),
    }));

    const total = Math.round(
      items.reduce((sum, item) => sum + item.lineTotal, 0) * 100
    ) / 100;

    return response.json({ items, total, shippingCost: SHIPPING_COST });
  } catch (error) {
    console.error('Error al consultar el carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo cargar el carrito',
    });
  }
});

app.post('/api/cart/items', requireAuth, async (request, response) => {
  const { productId, quantity } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 99
  ) {
    return response.status(400).json({
      message: 'Los datos del carrito no son válidos',
    });
  }

  try {
    const check = await pool.query(
      `SELECT p.stock, COALESCE(ci.quantity, 0) AS in_cart
       FROM products p
       LEFT JOIN cart_items ci
         ON ci.product_id = p.id AND ci.user_id = $2
       WHERE p.id = $1`,
      [productId, request.authenticatedUserId]
    );

    if (check.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    const { stock, in_cart } = check.rows[0];

    if (in_cart + quantity > stock) {
      return response.status(409).json({
        message: `No hay stock suficiente: quedan ${stock} unidades`,
      });
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity,
                     updated_at = now()
       RETURNING product_id, quantity`,
      [request.authenticatedUserId, productId, quantity]
    );

    return response.status(201).json({
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
    });
  } catch (error) {
    console.error('Error al añadir al carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo añadir el producto al carrito',
    });
  }
});

app.patch('/api/cart/items/:productId', requireAuth, async (request, response) => {
  const productId = Number(request.params.productId);
  const { quantity } = request.body ?? {};

  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 99
  ) {
    return response.status(400).json({
      message: 'Los datos del carrito no son válidos',
    });
  }

  try {
    const product = await pool.query(
      'SELECT stock FROM products WHERE id = $1',
      [productId]
    );

    if (product.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el producto',
      });
    }

    const { stock } = product.rows[0];

    if (quantity > stock) {
      return response.status(409).json({
        message: `No hay stock suficiente: quedan ${stock} unidades`,
      });
    }

    const result = await pool.query(
      `UPDATE cart_items
       SET quantity = $1, updated_at = now()
       WHERE user_id = $2 AND product_id = $3
       RETURNING product_id, quantity`,
      [quantity, request.authenticatedUserId, productId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: 'Ese producto no está en tu carrito',
      });
    }

    return response.json({
      productId: result.rows[0].product_id,
      quantity: result.rows[0].quantity,
    });
  } catch (error) {
    console.error('Error al cambiar la cantidad:', error.message);
    return response.status(500).json({
      message: 'No se pudo cambiar la cantidad',
    });
  }
});

app.delete('/api/cart/items/:productId', requireAuth, async (request, response) => {
  const productId = Number(request.params.productId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({
      message: 'El producto no es válido',
    });
  }

  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
      [request.authenticatedUserId, productId]
    );

    if (result.rowCount === 0) {
      return response.status(404).json({
        message: 'Ese producto no está en tu carrito',
      });
    }

    return response.status(204).send();
  } catch (error) {
    console.error('Error al quitar del carrito:', error.message);
    return response.status(500).json({
      message: 'No se pudo quitar el producto del carrito',
    });
  }
});

app.post('/api/orders', requireAuth, async (request, response) => {
  const { fullName, phone, address, city, postalCode } = request.body ?? {};

  if (
    typeof fullName !== 'string' ||
    fullName.trim() === '' ||
    typeof phone !== 'string' ||
    phone.trim() === '' ||
    typeof address !== 'string' ||
    address.trim() === '' ||
    typeof city !== 'string' ||
    city.trim() === '' ||
    typeof postalCode !== 'string' ||
    !/^\d{5}$/.test(postalCode.trim())
  ) {
    return response.status(400).json({
      message: 'Los datos de envío no son válidos',
    });
  }

  const userId = request.authenticatedUserId;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lines = await client.query(
      `SELECT p.name, ci.quantity, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1
       ORDER BY p.id
       FOR UPDATE OF ci, p`,
      [userId]
    );

    if (lines.rows.length === 0) {
      throw new OrderError(400, 'Tu carrito está vacío');
    }

    for (const line of lines.rows) {
      if (line.quantity > line.stock) {
        throw new OrderError(
          409,
          `No hay stock suficiente de "${line.name}": quedan ${line.stock} unidades`
        );
      }
    }

    const subtotalResult = await client.query(
      `SELECT SUM(p.price * ci.quantity) AS subtotal
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1`,
      [userId]
    );
    const subtotal = subtotalResult.rows[0].subtotal;

    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, subtotal, shipping_cost, total,
         shipping_name, shipping_phone, shipping_address,
         shipping_city, shipping_postal_code
       )
       VALUES ($1, $2::numeric, $3::numeric, $2::numeric + $3::numeric,
               $4, $5, $6, $7, $8)
       RETURNING id, status, subtotal, shipping_cost, total, created_at`,
      [
        userId,
        subtotal,
        SHIPPING_COST,
        fullName.trim(),
        phone.trim(),
        address.trim(),
        city.trim(),
        postalCode.trim(),
      ]
    );
    const order = orderResult.rows[0];

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
       SELECT $1::integer, ci.product_id, p.name, p.price, ci.quantity
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $2`,
      [order.id, userId]
    );

    await client.query(
      `UPDATE products p
       SET stock = p.stock - ci.quantity
       FROM cart_items ci
       WHERE ci.product_id = p.id AND ci.user_id = $1`,
      [userId]
    );

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    return response.status(201).json({
      id: order.id,
      status: order.status,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shipping_cost),
      total: Number(order.total),
      createdAt: order.created_at,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error instanceof OrderError) {
      return response.status(error.status).json({ message: error.message });
    }

    console.error('Error al crear el pedido:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el pedido',
    });
  } finally {
    client.release();
  }
});

function formatOrder(row) {
  return {
    id: row.id,
    status: row.status,
    subtotal: Number(row.subtotal),
    shippingCost: Number(row.shipping_cost),
    total: Number(row.total),
    createdAt: row.created_at,
  };
}

app.get('/api/orders', requireAuth, async (request, response) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.shipping_cost, o.total, o.created_at,
              COALESCE(SUM(oi.quantity), 0)::int AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC, o.id DESC`,
      [request.authenticatedUserId]
    );

    return response.json(
      result.rows.map((row) => ({
        ...formatOrder(row),
        itemCount: row.item_count,
      }))
    );
  } catch (error) {
    console.error('Error al consultar los pedidos:', error);
    return response.status(500).json({
      message: 'No se pudieron cargar los pedidos',
    });
  }
});

app.get('/api/orders/:id', requireAuth, async (request, response) => {
  const orderId = Number(request.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return response.status(400).json({
      message: 'El pedido no es válido',
    });
  }

  try {
    const orderResult = await pool.query(
      `SELECT id, status, subtotal, shipping_cost, total, created_at,
              shipping_name, shipping_phone, shipping_address,
              shipping_city, shipping_postal_code
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, request.authenticatedUserId]
    );

    if (orderResult.rows.length === 0) {
      return response.status(404).json({
        message: 'No se encontró el pedido',
      });
    }

    const itemsResult = await pool.query(
      `SELECT product_id, product_name, unit_price, quantity,
              (unit_price * quantity) AS line_total
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );

    const row = orderResult.rows[0];

    return response.json({
      ...formatOrder(row),
      shipping: {
        fullName: row.shipping_name,
        phone: row.shipping_phone,
        address: row.shipping_address,
        city: row.shipping_city,
        postalCode: row.shipping_postal_code,
      },
      items: itemsResult.rows.map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
        lineTotal: Number(item.line_total),
      })),
    });

const port = 3000;

app.listen(port, () => {
  console.log(`Backend disponible en http://localhost:${port}`);
});
