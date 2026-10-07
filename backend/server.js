const express = require('express');
const cors = require('cors');
const pool = require('./db');
const argon2 = require('argon2');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

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
  try {
    const result = await pool.query(
      'SELECT id, name, price, stock, color FROM products ORDER BY id'
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
  const { name, price, stock, color } = request.body ?? {};

  if (
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
      `INSERT INTO products (name, price, stock, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price, stock, color`,
      [name.trim(), price, stock, color ?? null]
    );

    return response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear el producto:', error.message);
    return response.status(500).json({
      message: 'No se pudo crear el producto',
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

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en backend/.env');
}

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

const port = 3000;

app.listen(port, () => {
  console.log(`Backend disponible en http://localhost:${port}`);
});
