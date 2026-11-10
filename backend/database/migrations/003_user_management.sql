-- 003: gestión de usuarios para administradores.
-- Sin BEGIN/COMMIT: se aplica en una sola transacción con psql -1.
--
-- El CHECK de users.role ya existe (users_role_check: 'customer' | 'admin'),
-- así que esta migración no lo toca.

ALTER TABLE users ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN blocked_at timestamptz NULL;

-- Sin claves ajenas a users a propósito: el registro debe sobrevivir
-- aunque se borre el administrador o el usuario afectado
CREATE TABLE admin_audit_log (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id integer NOT NULL,
    action text NOT NULL,
    target_user_id integer NOT NULL,
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_target_user_id_idx ON admin_audit_log (target_user_id);
