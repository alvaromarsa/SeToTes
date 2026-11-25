// Copia EXACTA de slugify del backend (backend/utils/categories.js), solo para la vista previa de
// la dirección al renombrar una categoría: el slug de verdad lo genera siempre el servidor. Las
// dos versiones pasan las mismas pruebas (backend/test/slugify-cases.json); si cambia una, la otra.
const SLUG_MAX_LENGTH = 60;

// "Mochilas de Lona" → "mochilas-de-lona"; "Ñandú & Co." → "nandu-co".
// Quita las tildes (NFD separa la letra de la tilde), pasa a minúsculas y convierte en "-"
// todo lo que no sea letra o número. Puede devolver '' (nombre solo con símbolos).
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}
