// Todo dato que venga del usuario o de la base de datos debe pasar por aquí antes de
// meterse en el HTML de un email: un nombre como "<img src=x onerror=...>" no debe ejecutarse.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

module.exports = { escapeHtml };
