-- 007: categorías de producto en una tabla (el admin podrá crear nuevas).
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- products.category sigue siendo texto con el SLUG de la categoría (los productos actuales
-- no cambian), pero deja de estar limitado por un CHECK con las 4 fijas y pasa a ser una
-- clave ajena a categories.slug.
--
-- Aplicar ANTES de desplegar el backend que lee la tabla categories. El backend anterior sigue
-- funcionando con la migración aplicada (solo conoce las 4 categorías, que existen en la tabla).

-- slug: lo genera SIEMPRE el servidor desde el nombre (minúsculas, sin tildes, con guiones);
--       es la parte de la URL (/categoria/<slug>) y lo que guarda products.category.
--       Único: dos nombres que solo se diferencian en mayúsculas, tildes o signos chocan.
-- name: texto plano escrito por el admin (validado en el servidor), de 2 a 40 caracteres.
-- position: orden en la navbar y en los listados; las nuevas van al final.
CREATE TABLE categories (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL,
    name text NOT NULL,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_slug_key UNIQUE (slug),
    CONSTRAINT categories_slug_format_check
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
    CONSTRAINT categories_name_length_check
        CHECK (char_length(name) BETWEEN 2 AND 40)
);

-- Las 4 categorías de siempre, en el mismo orden que la navbar actual
INSERT INTO categories (slug, name, position) VALUES
    ('bolsas', 'Bolsas', 1),
    ('neceseres', 'Neceseres', 2),
    ('fundas', 'Fundas', 3),
    ('telas', 'Telas', 4);

-- El CHECK con la lista fija se sustituye por la clave ajena. No se pierde ningún dato: el CHECK
-- garantizaba que todos los productos usan una de esas 4, y ya están en la tabla.
-- ON DELETE RESTRICT: no se podrá borrar una categoría que tenga productos.
ALTER TABLE products DROP CONSTRAINT products_category_check;
ALTER TABLE products ADD CONSTRAINT products_category_fkey
    FOREIGN KEY (category) REFERENCES categories (slug) ON DELETE RESTRICT;

-- Filtro del catálogo por categoría y comprobación de la clave ajena al borrar una categoría
CREATE INDEX products_category_idx ON products (category);
