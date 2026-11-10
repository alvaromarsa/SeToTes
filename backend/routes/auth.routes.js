const express = require('express');
const argon2 = require('argon2');

const pool = require('../db');
const { ACCOUNT_BLOCKED_CODE, BLOCKED_ACCOUNT_MESSAGE, requireAuth } = require('../middleware/auth');
const { clearAuthCookie } = require('../utils/auth-cookie');
const { formatSessionUser, startSession } = require('../utils/session');

const router = express.Router();

router.post('/register', async (request, response) => {
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

    // El registro deja la sesión iniciada, igual que el login
    const user = result.rows[0];
    startSession(response, user.id);

    return response.status(201).json({
      message: 'Usuario registrado correctamente',
      user: formatSessionUser(user),
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

router.post('/login', async (request, response) => {
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
      `SELECT id, full_name, phone, email, password_hash, created_at, role, is_blocked
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

    // Solo después de comprobar la contraseña: quien no la conoce no puede
    // averiguar si una cuenta existe o está bloqueada
    if (user.is_blocked) {
      return response.status(403).json({
        code: ACCOUNT_BLOCKED_CODE,
        message: BLOCKED_ACCOUNT_MESSAGE,
      });
    }

    startSession(response, user.id);

    return response.json({
      message: 'Inicio de sesión correcto',
      user: formatSessionUser(user),
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);
    return response.status(500).json({
      message: 'No se pudo iniciar sesión',
    });
  }
});

router.get('/me', requireAuth, async (request, response) => {
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

router.put('/me', requireAuth, async (request, response) => {
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

router.post('/logout', (request, response) => {
  clearAuthCookie(response);

  return response.json({
    message: 'Sesión cerrada correctamente',
  });
});

module.exports = router;
