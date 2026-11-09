-- 001: galería de imágenes de producto.
-- Se guarda solo la clave (uuid) de cada imagen; la URL la construye backend/storage.
-- La primera imagen por position es la principal. El máximo por producto
-- (MAX_PRODUCT_IMAGES en backend/config/constants.js) lo controla el backend.

BEGIN;

CREATE TABLE product_images (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    file_key text NOT NULL UNIQUE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_images_product_id_position_idx
    ON product_images (product_id, position);

COMMIT;
