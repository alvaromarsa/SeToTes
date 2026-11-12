-- 006: descripción de producto y ajustes de la tienda editables por el admin.
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- Todo lo que escribe el admin es TEXTO PLANO: se valida en el servidor y el frontend
-- lo muestra con interpolación (nunca como HTML).

-- NULL = sin descripción. char_length cuenta caracteres (no bytes), igual que la validación del backend
ALTER TABLE products ADD COLUMN description text NULL;
ALTER TABLE products ADD CONSTRAINT products_description_length_check
    CHECK (char_length(description) <= 2000);

-- Ajustes clave-valor. Las claves válidas son una lista blanca en el backend
-- (STORE_SETTINGS en config/constants.js), que también tiene los valores por defecto.
-- updated_by: id del admin que hizo el último cambio, sin clave ajena (como admin_audit_log),
-- para que borrar un usuario no obligue a tocar el historial
CREATE TABLE store_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by integer NULL
);

INSERT INTO store_settings (key, value) VALUES
    ('shipping_time_text', 'Entrega estimada en 3-5 días laborables'),
    ('announcement_text', '')
ON CONFLICT (key) DO NOTHING;
