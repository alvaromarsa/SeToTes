-- 010: fecha de creación de los productos, para «Novedades» de la portada
-- (GET /api/products?sort=newest&limit=N: los más recientes primero).
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- created_at la rellena SOLO la base de datos con su valor por defecto: el backend no la escribe al
-- crear ni al editar un producto (el cliente no puede enviarla). Los productos que ya existen
-- reciben todos la misma fecha (now() es la hora de inicio de la transacción): entre ellos el
-- orden lo decide el id descendente (ORDER BY created_at DESC, id DESC), que ya refleja el orden
-- en que se crearon.
--
-- Orden de despliegue: aplicar ANTES del backend que ordena por created_at (sin la columna, la
-- portada daría 500). El backend anterior funciona igual con ella aplicada (tiene valor por
-- defecto y no la lee).

ALTER TABLE products
    ADD COLUMN created_at timestamp with time zone NOT NULL DEFAULT now();

-- Mismo orden que la consulta de «Novedades»: lee las N primeras filas sin ordenar toda la tabla
CREATE INDEX products_created_at_id_idx ON products (created_at DESC, id DESC);
