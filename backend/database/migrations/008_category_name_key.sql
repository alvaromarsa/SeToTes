-- 008: nombre único de categoría aunque se renombre (name_key).
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- Hasta ahora la unicidad se apoyaba en el slug, que sale del nombre al crear. Al poder renombrar
-- (solo cambia el nombre; el slug no, porque lo usan products.category y las URL), nombre y slug
-- dejan de ir juntos: renombrar "Mochilas" a "Gorras" y luego crear "Gorras" daría dos categorías
-- con el mismo nombre. name_key es el nombre NORMALIZADO (lo calcula el servidor con slugify:
-- minúsculas, sin tildes, con guiones) y es único: "Gorras", "GORRAS" y "gorras!" chocan siempre.
--
-- Las categorías existentes nunca se han renombrado, así que su nombre normalizado es su slug.
--
-- Orden de despliegue: aplicar ANTES del backend que escribe name_key (crear y renombrar). Entre la
-- migración y ese despliegue, crear una categoría con el backend anterior fallaría (no envía
-- name_key, que es NOT NULL): aplicar y desplegar seguidos. Leer y borrar no se ven afectados.
-- Después hay que regenerar schema.sql: seed.sql ya inserta name_key.

ALTER TABLE categories ADD COLUMN name_key text;

UPDATE categories SET name_key = slug;

ALTER TABLE categories ALTER COLUMN name_key SET NOT NULL;

ALTER TABLE categories ADD CONSTRAINT categories_name_key_key UNIQUE (name_key);

-- Mismo formato que el slug (es lo que devuelve slugify)
ALTER TABLE categories ADD CONSTRAINT categories_name_key_format_check
    CHECK (name_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(name_key) <= 60);
