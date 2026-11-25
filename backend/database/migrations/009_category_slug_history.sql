-- 009: el slug de una categoría cambia al renombrarla y sus direcciones antiguas siguen funcionando.
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- category_slugs: TODOS los slugs de cada categoría, el actual y los antiguos (el historial son
-- las filas cuyo slug no es el actual de su categoría). Al renombrar, el backend inserta aquí el
-- slug nuevo y cambia categories.slug; el anterior se queda como dirección antigua que redirige a
-- la nueva.
--
-- Regla: un slug, actual o antiguo, no lo puede usar otra categoría mientras exista la suya. Lo
-- garantiza la clave primaria (también con dos renombrados o altas a la vez). Si una categoría
-- vuelve a un slug suyo antiguo, la fila ya existe y es suya: pasa a ser el actual (sale del
-- historial). Al borrar una categoría se borran sus slugs (ON DELETE CASCADE) y quedan libres: sus
-- enlaces antiguos muestran «Categoría no encontrada».
--
-- products.category guarda el slug: su clave ajena pasa a ON UPDATE CASCADE para que cambiar el
-- slug arrastre a los productos (sigue ON DELETE RESTRICT: no se borra una categoría con
-- productos). Ninguna otra tabla guarda la categoría (carrito y pedidos guardan el producto).
--
-- Orden de despliegue: aplicar ANTES del backend que lee category_slugs (GET /api/categories da
-- 500 sin la tabla). Con el backend anterior todo sigue funcionando: el trigger registra el slug de
-- las categorías que se creen entre medias.

CREATE TABLE category_slugs (
    slug text PRIMARY KEY,
    category_id integer NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    -- Mismo formato que categories.slug
    CONSTRAINT category_slugs_slug_format_check
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60)
);

-- Para leer los slugs de una categoría (lista pública) y para el borrado en cascada
CREATE INDEX category_slugs_category_id_idx ON category_slugs (category_id);

-- Los slugs actuales de las categorías que ya existen
INSERT INTO category_slugs (slug, category_id)
SELECT slug, id FROM categories;

-- Toda categoría nueva registra su slug, la cree quien la cree (backend, seed.sql o un INSERT a
-- mano). Sin ON CONFLICT: si el slug ya es de OTRA categoría (p. ej., una dirección antigua suya),
-- la clave primaria lo rechaza (23505, category_slugs_pkey) y el alta entera falla. Una categoría
-- recién creada nunca tiene ya su propia fila, así que no hay otro conflicto posible.
-- public.category_slugs con esquema: pg_dump/pg_restore trabajan con search_path vacío y, sin él,
-- el trigger no encontraría la tabla al restaurar datos.
CREATE FUNCTION register_category_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.category_slugs (slug, category_id) VALUES (NEW.slug, NEW.id);
    RETURN NULL;
END;
$$;

CREATE TRIGGER categories_register_slug
    AFTER INSERT ON categories
    FOR EACH ROW
    EXECUTE FUNCTION register_category_slug();

ALTER TABLE products DROP CONSTRAINT products_category_fkey;

ALTER TABLE products ADD CONSTRAINT products_category_fkey
    FOREIGN KEY (category) REFERENCES categories (slug) ON UPDATE CASCADE ON DELETE RESTRICT;
