const { countCharacters, normalizePlainText } = require('./plain-text');

// Categorías de producto (tabla categories, migración 007).
// El slug es la parte de la URL (/categoria/<slug>) y lo que guarda products.category.
// Lo genera SIEMPRE el servidor desde el nombre: el cliente nunca lo envía.

// Mismo formato que el CHECK categories_slug_format_check de la BD
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 60;

// Mismos límites que el CHECK categories_name_length_check (char_length)
const CATEGORY_NAME_MIN_LENGTH = 2;
const CATEGORY_NAME_MAX_LENGTH = 40;

// Slugs que no puede tener una categoría. Las categorías viven en /categoria/<slug>, así que no
// chocan con las rutas de la app; esta lista es una defensa extra por si alguna vez se sirven
// en el primer nivel de la URL. Incluye las rutas de Angular y las del servidor.
const RESERVED_SLUGS = new Set([
  'home',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'checkout',
  'orders',
  'producto',
  'adminpanel',
  'user-profile',
  'categoria',
  'categorias',
  'aviso-legal',
  'privacidad',
  'cookies',
  'condiciones',
  'envios-devoluciones',
  'api',
  'uploads',
]);

// "Mochilas de Lona" → "mochilas-de-lona"; "Ñandú & Co." → "nandu-co".
// Quita las tildes (NFD separa la letra de la tilde), pasa a minúsculas y convierte en "-"
// todo lo que no sea letra o número. Puede devolver '' (nombre solo con símbolos).
function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

function isValidSlug(value) {
  return typeof value === 'string' && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug);
}

function formatCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    position: row.position,
  };
}

// ¿Existe la categoría? Para validar products.category antes de escribir (la clave ajena
// products_category_fkey es la red de seguridad). db: el pool o el cliente de una transacción
async function categoryExists(db, slug) {
  if (!isValidSlug(slug)) {
    return false;
  }

  const result = await db.query('SELECT 1 FROM categories WHERE slug = $1', [slug]);
  return result.rows.length > 0;
}

// Nombre que escribe el admin al crear una categoría: texto plano de una línea, recortado y con
// los espacios repetidos reducidos a uno; de 2 a 40 caracteres. Genera el slug y lo valida.
// Devuelve { name, slug } o { error } con un mensaje para el usuario.
function parseCategoryName(value) {
  const text = normalizePlainText(typeof value === 'string' ? value.replace(/ {2,}/g, ' ') : value, {
    maxLength: Number.POSITIVE_INFINITY,
    multiline: false,
  });

  if (text === null) {
    return { error: 'El nombre de la categoría no es válido' };
  }

  const length = countCharacters(text);

  if (length < CATEGORY_NAME_MIN_LENGTH || length > CATEGORY_NAME_MAX_LENGTH) {
    return {
      error: `El nombre debe tener entre ${CATEGORY_NAME_MIN_LENGTH} y ${CATEGORY_NAME_MAX_LENGTH} caracteres`,
    };
  }

  const slug = slugify(text);

  if (slug === '') {
    return { error: 'El nombre debe incluir al menos una letra o un número' };
  }

  if (isReservedSlug(slug)) {
    return { error: 'Ese nombre no se puede usar para una categoría' };
  }

  return { name: text, slug };
}

module.exports = {
  SLUG_MAX_LENGTH,
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  parseCategoryName,
  RESERVED_SLUGS,
  slugify,
  isValidSlug,
  isReservedSlug,
  formatCategory,
  categoryExists,
};
