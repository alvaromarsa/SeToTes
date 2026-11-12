const { STORE_SETTINGS } = require('../config/constants');
const { countCharacters, normalizePlainText } = require('./plain-text');

const SETTING_KEYS = STORE_SETTINGS.map((setting) => setting.key);

// Única forma de leer los ajustes: solo las claves de la lista blanca, en camelCase y con el
// valor por defecto si falta alguna fila. db puede ser el pool o un cliente de una transacción.
async function getStoreSettings(db) {
  const result = await db.query(
    'SELECT key, value FROM store_settings WHERE key = ANY($1::text[])',
    [SETTING_KEYS]
  );
  const stored = new Map(result.rows.map((row) => [row.key, row.value]));

  return Object.fromEntries(
    STORE_SETTINGS.map((setting) => [setting.field, stored.get(setting.key) ?? setting.defaultValue])
  );
}

// Valida el cuerpo del PUT de admin: exactamente las claves de la lista blanca, sin ninguna otra.
// Devuelve { values: [{ key, value }] } o { error: 'mensaje en español' }.
function parseStoreSettingsInput(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Los ajustes no son válidos' };
  }

  const allowedFields = STORE_SETTINGS.map((setting) => setting.field);
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    return { error: 'Hay ajustes que no existen' };
  }

  const values = [];

  for (const setting of STORE_SETTINGS) {
    if (!(setting.field in body)) {
      return { error: 'Faltan ajustes por enviar' };
    }

    const value = normalizePlainText(body[setting.field], {
      maxLength: setting.maxLength,
      multiline: false,
    });

    if (value === null || countCharacters(value) < setting.minLength) {
      return {
        error: setting.minLength > 0
          ? `${setting.label} debe tener entre ${setting.minLength} y ${setting.maxLength} caracteres, en una sola línea`
          : `${setting.label} debe tener como máximo ${setting.maxLength} caracteres, en una sola línea`,
      };
    }

    values.push({ key: setting.key, value });
  }

  return { values };
}

module.exports = { getStoreSettings, parseStoreSettingsInput };
