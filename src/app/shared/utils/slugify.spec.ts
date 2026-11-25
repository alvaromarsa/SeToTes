// Mismos casos que el slugify del servidor (backend/test/slugify.test.js): la vista previa de la
// dirección al renombrar debe coincidir con el slug que genera el backend.
import cases from '../../../../backend/test/slugify-cases.json';
import { slugify } from './slugify';

describe('slugify (mismos casos que el servidor)', () => {
  for (const { name, slug, why } of cases) {
    it(`${why}: «${name}» → «${slug}»`, () => {
      expect(slugify(name)).toBe(slug);
    });
  }
});
