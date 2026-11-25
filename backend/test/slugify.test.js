// Pruebas de slugify (utils/categories.js). Los casos están en slugify-cases.json y el frontend
// (shared/utils/slugify.ts) usa EXACTAMENTE los mismos: así la vista previa de la dirección que ve
// el admin al renombrar coincide con el slug que genera el servidor. Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const { slugify, isValidSlug, SLUG_MAX_LENGTH } = require('../utils/categories');
const cases = require('./slugify-cases.json');

for (const { name, slug, why } of cases) {
  test(`slugify: ${why} («${name}» → «${slug}»)`, () => {
    assert.equal(slugify(name), slug);
  });
}

test('slugify: todo resultado no vacío cumple el formato de la BD y el máximo', () => {
  for (const { name } of cases) {
    const slug = slugify(name);

    if (slug !== '') {
      assert.ok(isValidSlug(slug), `«${slug}» no tiene el formato de un slug`);
      assert.ok(slug.length <= SLUG_MAX_LENGTH);
    }
  }
});
