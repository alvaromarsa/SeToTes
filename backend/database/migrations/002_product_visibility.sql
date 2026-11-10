-- 002: visibilidad de productos.
-- Los productos que ya existen quedan visibles (DEFAULT true al añadir la columna);
-- después el valor por defecto pasa a false para que los nuevos nazcan ocultos.
-- Publicar exige al menos una imagen: esa regla la aplica el backend.

BEGIN;

ALTER TABLE products ADD COLUMN is_visible boolean NOT NULL DEFAULT true;

ALTER TABLE products ALTER COLUMN is_visible SET DEFAULT false;

COMMIT;
