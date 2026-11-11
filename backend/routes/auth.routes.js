const express = require('express');
const argon2 = require('argon2');

const pool = require('../db');
const { frontendUrl } = require('../config/env');
const {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} = require('../config/constants');
const { ACCOUNT_BLOCKED_CODE, BLOCKED_ACCOUNT_MESSAGE, requireAuth } = require('../middleware/auth');
const {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
} = require('../middleware/rate-limit');
const { sendEmail, sendEmailInBackground } = require('../services/email');
const { passwordChangedEmail } = require('../services/email/templates/password-changed');
const { passwordResetEmail } = require('../services/email/templates/password-reset');
const { clearAuthCookie } = require('../utils/auth-cookie');
const { runInBackground } = require('../utils/background');
const { generateResetToken, hashResetToken, isWellFormedResetToken } = require('../utils/password-reset');
const { formatSessionUser, startSession } = require('../utils/session');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORGOT_PASSWORD_MESSAGE =
  'Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer la contraseña. Revisa también la carpeta de spam.';
const INVALID_RESET_LINK_MESSAGE = 'El enlace no es válido o ha caducado. Pide uno nuevo.';

const router = express.Router();

router.post('/register', registerLimiter, async (request, response) => {
  const { fullName, phone, email, password } = request.body ?? {};

  if (
    typeof fullName !== 'string' ||
    fullName.trim() === '' ||
    typeof phone !== 'string' ||
    phone.trim() === '' ||
    typeof email !== 'string' ||
    !EMAIL_PATTERN.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return response.status(400).json({
      message: `Revisa los datos: el nombre, el teléfono y el email son obligatorios; la contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
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

router.post('/login', loginLimiter, async (request, response) => {
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

// Crea el token y envía el email. Se ejecuta en segundo plano (ver forgot-password).
async function createPasswordReset(email) {
  const client = await pool.connect();
  let user;
  let token;

  try {
    await client.query('BEGIN');

    // FOR UPDATE: dos solicitudes simultáneas del mismo usuario no dejan dos enlaces válidos
    const result = await client.query(
      'SELECT id, full_name, email, is_blocked FROM users WHERE email = $1 FOR UPDATE',
      [email]
    );
    user = result.rows[0];

    // Sin cuenta o bloqueada: no se hace nada (la respuesta ya fue la misma)
    if (!user || user.is_blocked) {
      await client.query('ROLLBACK');
      return;
    }

    // Solo vale el último enlace pedido
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    token = generateResetToken();

    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [user.id, hashResetToken(token), PASSWORD_RESET_TOKEN_TTL_MINUTES]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // El token en claro solo va en el email; nunca se registra en logs
  const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: user.email, ...passwordResetEmail({ fullName: user.full_name, resetUrl }) });
}

router.post('/forgot-password', forgotPasswordLimiter, (request, response) => {
  const { email } = request.body ?? {};

  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return response.status(400).json({
      message: 'Introduce un email válido',
    });
  }

  // Misma respuesta, y al instante, exista la cuenta o no: todo el trabajo (consultas,
  // escrituras y email) va en segundo plano para que el tiempo de respuesta no lo delate
  response.json({ message: FORGOT_PASSWORD_MESSAGE });

  runInBackground(
    () => createPasswordReset(email.trim().toLowerCase()),
    'solicitud de recuperación de contraseña'
  );
});

router.post('/reset-password', resetPasswordLimiter, async (request, response) => {
  const { token, password } = request.body ?? {};

  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return response.status(400).json({
      message: `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
    });
  }

  if (!isWellFormedResetToken(token)) {
    return response.status(400).json({ message: INVALID_RESET_LINK_MESSAGE });
  }

  // argon2 es lento a propósito: se calcula antes de abrir la transacción para no alargarla
  let passwordHash;
  try {
    passwordHash = await argon2.hash(password);
  } catch (error) {
    console.error('Error al calcular el hash de la contraseña:', error.message);
    return response.status(500).json({ message: 'No se pudo cambiar la contraseña' });
  }

  const client = await pool.connect();
  let user;

  try {
    await client.query('BEGIN');

    // Bloquea el token y el usuario: un mismo enlace no puede usarse dos veces a la vez
    const result = await client.query(
      `SELECT t.id AS token_id, u.id AS user_id, u.full_name, u.email, u.is_blocked
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
         AND t.used_at IS NULL
         AND t.expires_at > now()
       FOR UPDATE OF t, u`,
      [hashResetToken(token)]
    );
    user = result.rows[0];

    // No existe, ya se usó, ha caducado o la cuenta está bloqueada: mismo mensaje
    if (!user || user.is_blocked) {
      await client.query('ROLLBACK');
      return response.status(400).json({ message: INVALID_RESET_LINK_MESSAGE });
    }

    // password_changed_at invalida en requireAuth las sesiones emitidas antes del cambio
    await client.query(
      'UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
      [passwordHash, user.user_id]
    );

    // Gasta este enlace y cualquier otro pendiente del usuario
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.user_id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al restablecer la contraseña:', error.message);
    return response.status(500).json({
      message: 'No se pudo cambiar la contraseña',
    });
  } finally {
    client.release();
  }

  // No se inicia sesión: el usuario entra con la nueva contraseña. Una cookie anterior
  // en este navegador ya no sirve, así que se borra
  clearAuthCookie(response);
  response.json({
    message: 'Tu contraseña se ha cambiado. Ya puedes iniciar sesión con la nueva.',
  });

  sendEmailInBackground(
    { to: user.email, ...passwordChangedEmail({ fullName: user.full_name }) },
    `aviso de contraseña cambiada (usuario ${user.user_id})`
  );
});

router.post('/logout', (request, response) => {
  clearAuthCookie(response);

  return response.json({
    message: 'Sesión cerrada correctamente',
  });
});

module.exports = router;
