-- 005: pago con Stripe Checkout y aceptación de condiciones.
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- Todas las columnas nuevas admiten NULL porque ya hay pedidos y usuarios anteriores.
-- Un pedido solo pasa a 'paid' desde el webhook firmado de Stripe (paid_at lo fija el webhook).

ALTER TABLE orders ADD COLUMN stripe_checkout_session_id text NULL UNIQUE;
ALTER TABLE orders ADD COLUMN stripe_payment_intent_id text NULL;
ALTER TABLE orders ADD COLUMN paid_at timestamptz NULL;
ALTER TABLE orders ADD COLUMN terms_accepted_at timestamptz NULL;
ALTER TABLE orders ADD COLUMN terms_version text NULL;

ALTER TABLE users ADD COLUMN privacy_accepted_at timestamptz NULL;
ALTER TABLE users ADD COLUMN privacy_notice_version text NULL;

-- Idempotencia del webhook: Stripe puede reenviar el mismo evento; solo se procesa una vez
CREATE TABLE stripe_events (
    event_id text PRIMARY KEY,
    type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);
