-- Datos imprescindibles para ARRANCAR una base de datos NUEVA (creada con schema.sql, que es
-- solo estructura). Hoy: las 4 categorías iniciales, sin las que no se pueden crear productos.
--
-- SOLO para una BD nueva. NO ejecutar sobre una BD con datos reales: cuando exista el borrado de
-- categorías, volvería a crear las que se hayan borrado.
--
-- Idempotente (ON CONFLICT DO NOTHING): ejecutarlo dos veces no duplica nada ni cambia lo que ya
-- exista. Sin datos de clientes, pedidos ni usuarios.
--
-- Las mismas 4 categorías están en la migración 007_categories.sql: si cambian, en los dos sitios.

INSERT INTO categories (slug, name, position) VALUES
    ('bolsas', 'Bolsas', 1),
    ('neceseres', 'Neceseres', 2),
    ('fundas', 'Fundas', 3),
    ('telas', 'Telas', 4)
ON CONFLICT (slug) DO NOTHING;
