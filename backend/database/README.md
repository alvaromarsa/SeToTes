# Base de datos

PostgreSQL, base de datos `totebag_db`. El backend usa SQL escrito a mano con `pg` (sin ORM).

```
backend/database/
├── schema.sql      # Esquema completo actual (solo estructura, sin datos)
└── migrations/     # Cambios de esquema, numerados y en orden
```

## Crear la base de datos desde cero

```bash
createdb -U <usuario> totebag_db
psql -U <usuario> -d totebag_db -f backend/database/schema.sql
```

`schema.sql` refleja el estado actual del esquema, así que ya incluye todas las migraciones existentes.

## Migraciones

Cada cambio de esquema (tablas, columnas, restricciones, índices) se escribe en un archivo SQL nuevo dentro de `migrations/`:

```
backend/database/migrations/NNN_descripcion.sql
```

- `NNN`: número de tres cifras, correlativo (`001`, `002`, `003`…). Fija el orden de aplicación.
- `descripcion`: en minúsculas y con guiones bajos, explica el cambio. Ejemplo: `004_add_image_url_to_products.sql`.
- Una migración ya aplicada no se edita: si hay que corregir algo, se crea una migración nueva.
- Desde la 005, las migraciones no llevan `BEGIN; … COMMIT;`: se aplican con `psql -1` (todo en una transacción) y `ON_ERROR_STOP=1`, así se aplican enteras o no se aplican.

Las migraciones **se aplican a mano** con `psql`, en orden numérico:

```bash
psql -1 -v ON_ERROR_STOP=1 -U <usuario> -d totebag_db -f backend/database/migrations/NNN_descripcion.sql
```

Con el Postgres del `docker-compose.yml` de desarrollo, ver el README principal.

### 007_categories.sql

Crea la tabla `categories` (`slug` único, `name`, `position`) con las 4 categorías de siempre y cambia `products.category`: deja de tener el `CHECK` con la lista fija y pasa a ser una clave ajena a `categories.slug` (`ON DELETE RESTRICT`). Los productos no cambian.

- **Orden de despliegue:** aplicarla ANTES de desplegar el backend que lee `categories`. El backend anterior funciona igual con ella aplicada.
- Después, regenerar `schema.sql` (abajo).

No hay herramienta de migraciones ni tabla de control: hay que llevar la cuenta de cuál es la última aplicada en cada entorno.

## Regenerar `schema.sql`

Después de aplicar una migración, se vuelca de nuevo el esquema para que `schema.sql` siga siendo la foto actual:

```bash
pg_dump -U <usuario> -d totebag_db --schema-only --no-owner --no-privileges -f backend/database/schema.sql
```

- `--schema-only`: solo estructura, sin datos de clientes ni pedidos.
- `--no-owner` y `--no-privileges`: el archivo no depende de los roles de la máquina donde se generó.

Se recomienda subir la migración y el `schema.sql` regenerado en el mismo commit.
