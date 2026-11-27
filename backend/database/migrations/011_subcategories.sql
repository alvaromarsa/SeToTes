-- 011: subcategorías de UN solo nivel (categoría → subcategoría).
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1. Requiere PostgreSQL >= 12
-- (columnas generadas STORED).
--
-- Las URL siguen siendo planas (/categoria/<slug>) y el slug, único en toda la tienda: el
-- historial de slugs (category_slugs, migración 009) y su trigger no cambian.
--
-- Dos reglas, las dos garantizadas por la base de datos (también con peticiones simultáneas):
--
-- 1) UN SOLO NIVEL, sin triggers: columnas generadas + clave ajena compuesta.
--    depth        = 0 si la categoría es de primer nivel, 1 si es subcategoría.
--    parent_depth = 0 si tiene padre; NULL si no.
--    FOREIGN KEY (parent_id, parent_depth) REFERENCES categories (id, depth): el padre tiene que
--    ser una fila con depth = 0, es decir, de primer nivel (una subcategoría no puede tener
--    subcategorías). Sin padre, parent_id y parent_depth son NULL y la clave no se comprueba
--    (MATCH SIMPLE). Y al revés: una categoría CON subcategorías no puede pasar a tener padre,
--    porque su depth cambiaría de 0 a 1 y la clave ajena (ON UPDATE RESTRICT) lo impide mientras
--    alguna hija la apunte. Borrar un padre con hijas también lo impide (ON DELETE RESTRICT).
--
-- 2) LOS PRODUCTOS SOLO EN CATEGORÍAS «HOJA» (sin subcategorías), con triggers y bloqueos:
--    - products_category_leaf (BEFORE INSERT/UPDATE OF category en products): bloquea la
--      categoría del producto con FOR SHARE y comprueba que no tiene hijas.
--    - categories_lock_parent (BEFORE INSERT/UPDATE OF parent_id en categories): bloquea el padre
--      con FOR UPDATE.
--    - categories_parent_without_products (CONSTRAINT TRIGGER, DIFERIDO al COMMIT): comprueba que
--      el padre no tiene productos.
--    FOR UPDATE y FOR SHARE sobre la MISMA fila (el padre) son incompatibles: un alta de producto
--    y un alta de subcategoría en esa categoría nunca avanzan a la vez; la segunda espera al
--    COMMIT de la primera y después ve lo que hizo (en READ COMMITTED cada sentencia del trigger
--    toma una foto nueva), y se rechaza si rompe la regla. Cada transacción bloquea UNA sola fila
--    de categoría para esta regla, así que no hay orden en el que se interbloqueen.
--
--    ¿Por qué la comprobación del padre es DIFERIDA? Para crear la primera subcategoría de una
--    categoría que ya tiene productos y moverlos a ella en la misma transacción (moveProducts):
--    la subcategoría tiene que existir antes de mover los productos (clave ajena de products), y
--    hasta que se mueven el padre aún tiene productos. Diferida, la regla se comprueba al COMMIT,
--    cuando ya no los tiene; y como el bloqueo FOR UPDATE es inmediato y dura hasta el COMMIT,
--    nadie puede meter un producto en el padre entre medias. Alternativas descartadas: SET LOCAL
--    con una variable que desactive la comprobación (cualquier sesión podría saltarse la regla) o
--    crear la subcategoría sin padre y asignarlo después (un estado intermedio raro de explicar).
--    Un error de la comprobación diferida llega en el COMMIT (23514).
--
-- Errores (para el backend): 23503 categories_parent_fkey (padre que no existe, que no es de
-- primer nivel o borrar un padre con hijas); 23514 products_category_leaf (producto en una
-- categoría con subcategorías) y 23514 categories_parent_without_products (subcategoría en un
-- padre con productos).
--
-- Orden de despliegue: aplicar ANTES del backend que lee parent_id (sin la columna,
-- GET /api/categories daría 500). El backend anterior funciona con ella aplicada: todas sus
-- categorías son de primer nivel y los triggers no rechazan nada.

ALTER TABLE categories ADD COLUMN parent_id integer;

ALTER TABLE categories ADD COLUMN depth smallint
    GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END) STORED;

ALTER TABLE categories ADD COLUMN parent_depth smallint
    GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN NULL ELSE 0 END) STORED;

ALTER TABLE categories ADD CONSTRAINT categories_parent_not_self_check CHECK (parent_id <> id);

-- Destino de la clave ajena compuesta (id ya es único; la pareja también)
ALTER TABLE categories ADD CONSTRAINT categories_id_depth_key UNIQUE (id, depth);

ALTER TABLE categories ADD CONSTRAINT categories_parent_fkey
    FOREIGN KEY (parent_id, parent_depth) REFERENCES categories (id, depth)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Subcategorías de un padre (lista, borrado y la comprobación de hoja)
CREATE INDEX categories_parent_id_idx ON categories (parent_id);

-- Funciones con esquema (public.…): pg_dump/pg_restore trabajan con search_path vacío.

-- Producto: su categoría no puede tener subcategorías. Solo si la categoría cambia (un PUT que
-- deja la misma no bloquea nada). El ON UPDATE CASCADE de un renombrado también pasa por aquí.
CREATE FUNCTION check_product_category_is_leaf() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.category IS NOT DISTINCT FROM OLD.category THEN
        RETURN NEW;
    END IF;

    PERFORM 1 FROM public.categories WHERE slug = NEW.category FOR SHARE;

    IF EXISTS (
        SELECT 1
        FROM public.categories parent
        JOIN public.categories child ON child.parent_id = parent.id
        WHERE parent.slug = NEW.category
    ) THEN
        RAISE EXCEPTION 'La categoría % tiene subcategorías: el producto debe ir en una de ellas', NEW.category
            USING ERRCODE = 'check_violation', CONSTRAINT = 'products_category_leaf';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER products_category_leaf
    BEFORE INSERT OR UPDATE OF category ON products
    FOR EACH ROW
    EXECUTE FUNCTION check_product_category_is_leaf();

-- Subcategoría nueva (o que cambia de padre): bloqueo INMEDIATO del padre hasta el COMMIT
CREATE FUNCTION lock_category_parent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        PERFORM 1 FROM public.categories WHERE id = NEW.parent_id FOR UPDATE;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER categories_lock_parent
    BEFORE INSERT OR UPDATE OF parent_id ON categories
    FOR EACH ROW
    EXECUTE FUNCTION lock_category_parent();

-- Al COMMIT: el padre no puede tener productos (diferida para permitir moveProducts)
CREATE FUNCTION check_category_parent_without_products() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.products p
        JOIN public.categories parent ON parent.slug = p.category
        WHERE parent.id = NEW.parent_id
    ) THEN
        RAISE EXCEPTION 'La categoría padre % tiene productos', NEW.parent_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_parent_without_products';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER categories_parent_without_products
    AFTER INSERT OR UPDATE OF parent_id ON categories
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION check_category_parent_without_products();
