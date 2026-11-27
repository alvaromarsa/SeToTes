const { countCharacters, normalizePlainText } = require('./plain-text');

// Categorías de producto (tabla categories, migración 007).
// El slug es la parte de la URL (/categoria/<slug>) y lo que guarda products.category.
// Lo genera SIEMPRE el servidor desde el nombre: el cliente nunca lo envía. Cambia al renombrar
// (migración 009): los anteriores quedan en category_slugs y redirigen al actual.

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

// Columna previous_slugs para un SELECT/RETURNING sobre categories con alias c: los slugs
// antiguos de la categoría (los de category_slugs que no son el actual), del más reciente al más
// antiguo. El frontend los usa para redirigir /categoria/<antiguo> a la dirección actual
const PREVIOUS_SLUGS_COLUMN = `COALESCE(
    (SELECT array_agg(s.slug ORDER BY s.created_at DESC, s.slug)
     FROM category_slugs s
     WHERE s.category_id = c.id AND s.slug <> c.slug),
    '{}'
  ) AS previous_slugs`;

// parentId: null en las de primer nivel; el id del padre en las subcategorías (migración 011)
function formatCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    position: row.position,
    parentId: row.parent_id ?? null,
    previousSlugs: row.previous_slugs ?? [],
  };
}

// ¿Puede un producto ir en esta categoría? Para validar products.category antes de escribir:
// 'missing' (no existe), 'has-subcategories' (tiene subcategorías: el producto debe ir en una de
// ellas, migración 011) u 'ok'. Las redes de seguridad son la clave ajena products_category_fkey
// y el trigger products_category_leaf. db: el pool o el cliente de una transacción
async function getProductCategoryStatus(db, slug) {
  if (!isValidSlug(slug)) {
    return 'missing';
  }

  const result = await db.query(
    `SELECT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = c.id) AS has_children
     FROM categories c
     WHERE c.slug = $1`,
    [slug]
  );

  if (result.rows.length === 0) {
    return 'missing';
  }

  return result.rows[0].has_children ? 'has-subcategories' : 'ok';
}

// Nombre que escribe el admin al crear o renombrar una categoría: texto plano de una línea, recortado y con
// los espacios repetidos reducidos a uno; de 2 a 40 caracteres. Genera el slug y lo valida.
// Devuelve { name, slug, nameKey } o { error } con un mensaje para el usuario.
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

  // nameKey (columna name_key, migración 008): el nombre normalizado, único entre categorías. Es
  // igual al slug; solo difiere en las categorías renombradas antes de la 009 (nombre y slug
  // desfasados) hasta que se vuelven a guardar
  return { name: text, slug, nameKey: slug };
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
  PREVIOUS_SLUGS_COLUMN,
  formatCategory,
  getProductCategoryStatus,
};
