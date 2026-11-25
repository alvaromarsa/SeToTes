-- Datos imprescindibles para ARRANCAR una base de datos NUEVA (creada con schema.sql, que es
-- solo estructura). Hoy: las 4 categorías iniciales, sin las que no se pueden crear productos.
--
-- SOLO para una BD nueva. NO ejecutar sobre una BD con datos reales: volvería a crear las
-- categorías que se hayan borrado.
--
-- Idempotente (ON CONFLICT DO NOTHING): ejecutarlo dos veces no duplica nada ni cambia lo que ya
-- exista. Sin datos de clientes, pedidos ni usuarios.
--
-- Si se BORRA una de estas 4 desde el panel, ejecutar este archivo la volvería a crear (otro
-- motivo para no ejecutarlo nunca sobre datos reales). Si se RENOMBRA (desde la 009 su slug
-- cambia y el antiguo queda en category_slugs), el seed FALLA entero: el trigger
-- categories_register_slug rechaza el slug antiguo (23505), que sigue siendo de la renombrada.
--
-- Las mismas 4 categorías están en la migración 007_categories.sql: si cambian, en los dos sitios.
-- name_key (migración 008) es el nombre normalizado: para estas 4, igual que el slug.
-- category_slugs (migración 009) no se rellena aquí: lo hace el trigger al insertar cada una.

INSERT INTO categories (slug, name, name_key, position) VALUES
    ('bolsas', 'Bolsas', 'bolsas', 1),
    ('neceseres', 'Neceseres', 'neceseres', 2),
    ('fundas', 'Fundas', 'fundas', 3),
    ('telas', 'Telas', 'telas', 4)
ON CONFLICT DO NOTHING;
