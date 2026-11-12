// Validación de los textos libres que escribe el admin (descripción de producto, ajustes).
// Son TEXTO PLANO: aquí no se escapa ni se quita HTML; se guarda tal cual y el frontend lo
// muestra con interpolación, que nunca lo interpreta. Solo se rechaza lo que no es texto.

// Caracteres de control. En los textos de varias líneas se permiten el salto de línea y el tabulador
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F]/;
const MULTILINE_FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F]/;

// Cuenta caracteres (puntos de código), igual que char_length en PostgreSQL.
// String.length cuenta unidades UTF-16: un emoji valdría 2.
function countCharacters(text) {
  return [...text].length;
}

// Devuelve el texto normalizado (saltos de línea \n y sin espacios en los extremos),
// o null si no es válido. Quien llama decide qué hacer con la cadena vacía.
function normalizePlainText(value, { maxLength, multiline }) {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.replace(/\r\n?/g, '\n').trim();
  const forbidden = multiline ? MULTILINE_FORBIDDEN : SINGLE_LINE_FORBIDDEN;

  if (forbidden.test(text) || countCharacters(text) > maxLength) {
    return null;
  }

  return text;
}

module.exports = { countCharacters, normalizePlainText };
