-- 004: recuperación de contraseña.
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- password_changed_at invalida las sesiones (JWT) emitidas antes del cambio.
-- De cada token solo se guarda su hash SHA-256: el token en claro solo viaja en el email.

ALTER TABLE users ADD COLUMN password_changed_at timestamptz NULL;

CREATE TABLE password_reset_tokens (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
