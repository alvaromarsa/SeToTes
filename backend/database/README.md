# Base de datos

PostgreSQL, base de datos `totebag_db`. El backend usa SQL escrito a mano con `pg` (sin ORM).

```
backend/database/
├── schema.sql      # Esquema completo actual (solo estructura, sin datos)
├── seed.sql        # Datos imprescindibles para arrancar una BD NUEVA (las 4 categorías iniciales)
└── migrations/     # Cambios de esquema, numerados y en orden
```

## Crear la base de datos desde cero

```bash
createdb -U <usuario> totebag_db
psql -U <usuario> -d totebag_db -f backend/database/schema.sql
psql -v ON_ERROR_STOP=1 -U <usuario> -d totebag_db -f backend/database/seed.sql
```

`schema.sql` refleja el estado actual del esquema, así que ya incluye todas las migraciones existentes. Como es solo estructura, no trae datos: sin `seed.sql`, la tabla `categories` estaría vacía y no se podría crear ningún producto.

> **AVISO:** `seed.sql` es solo para una BD NUEVA. No lo ejecutes sobre una BD con datos reales: si se ha borrado desde el panel alguna de las 4 categorías por defecto, la volvería a crear. Una BD que ya existía recibe las categorías con las migraciones `007_categories.sql`, `008_category_name_key.sql` y `009_category_slug_history.sql`, no con el seed (y tampoco esas migraciones se vuelven a aplicar).

- `seed.sql` es idempotente (`ON CONFLICT DO NOTHING`): ejecutarlo dos veces no duplica nada ni cambia lo que ya exista. Pero si se ha RENOMBRADO una de las 4 por defecto (desde la 009 su slug cambia y el antiguo sigue siendo suyo), el seed falla entero: el trigger rechaza el slug antiguo (otro motivo para no ejecutarlo nunca sobre datos reales).
- `category_slugs` (migración 009) no se rellena en `seed.sql`: lo hace el trigger al insertar cada categoría.
- `seed.sql` inserta `name_key` (migración 008): necesita un `schema.sql` regenerado después de aplicar la 008.
- Con Docker (`docker-compose.yml`), `schema.sql` y `seed.sql` se montan como `001-schema.sql` y `002-seed.sql` en `/docker-entrypoint-initdb.d/` y se ejecutan solos, en ese orden, **solo con el volumen vacío** (primera vez o tras `docker compose down -v`).
- Las 4 categorías iniciales están en dos sitios: `seed.sql` y la migración 007. Si cambian, en los dos.

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

### 008_category_name_key.sql

Añade `categories.name_key`: el nombre NORMALIZADO (minúsculas, sin tildes, con guiones; lo calcula el servidor), `NOT NULL` y `UNIQUE`. Las existentes se rellenan con `name_key = slug`. Hace falta porque renombrar solo cambia el nombre (el slug no, lo usan `products.category` y las URL): sin `name_key`, renombrar «Mochilas» a «Gorras» y luego crear «Gorras» daría dos categorías con el mismo nombre.

- **Orden de despliegue:** aplicarla ANTES del backend que escribe `name_key` (crear y renombrar categorías), y desplegar ese backend justo después. Entre medias, crear una categoría con el backend anterior falla (no envía `name_key`); leer y borrar no se ven afectados.
- Después, regenerar `schema.sql`: el `seed.sql` actual ya inserta `name_key` y no funcionaría con el `schema.sql` antiguo.

### 009_category_slug_history.sql

El slug de una categoría cambia al renombrarla (sale del nombre nuevo) y sus direcciones antiguas siguen funcionando.

- Tabla `category_slugs` (`slug` clave primaria con el formato de un slug, `category_id` → `categories(id)` `ON DELETE CASCADE`, `created_at`): TODOS los slugs de cada categoría, el actual y los antiguos. Se rellena con los slugs actuales.
- Trigger `categories_register_slug` (`AFTER INSERT` en `categories`, función `register_category_slug()`): registra el slug de cada categoría nueva, la cree quien la cree. Sin `ON CONFLICT`: si el slug es una dirección antigua de OTRA categoría, la clave primaria rechaza el alta entera (23505 `category_slugs_pkey`). La función escribe `public.category_slugs` con su esquema porque `pg_dump`/`pg_restore` trabajan con `search_path` vacío.
- `products_category_fkey` pasa a `ON UPDATE CASCADE ON DELETE RESTRICT`: cambiar el slug arrastra a los productos.
- Un slug, actual o antiguo, no lo usa otra categoría mientras exista la suya; al borrar la categoría, sus slugs se liberan.
- El cambio de slug al renombrar lo hace el backend (PATCH), en una transacción. Un `UPDATE categories SET slug = …` hecho a mano NO se registra en `category_slugs`: no hacerlo.
- **Orden de entrega:** aplicar la 009 en local → regenerar `schema.sql` → commit → aplicar la 009 en Neon → push. El backend anterior funciona con ella aplicada; el nuevo SIN ella no: `GET /api/categories` da 500 (la tabla no existe).

### 010_product_created_at.sql

Añade `products.created_at` (`timestamptz NOT NULL DEFAULT now()`) y el índice `products_created_at_id_idx (created_at DESC, id DESC)`, para «Novedades» (`GET /api/products?sort=newest&limit=N`). No toca nada más de `products`.

- La rellena SOLO la base de datos con el valor por defecto: el backend no la escribe al crear ni al editar. Los productos que ya existen reciben todos la misma fecha (la de la migración); entre ellos desempata el id descendente.
- `seed.sql` no inserta productos: no le afecta.
- **Orden de entrega:** aplicar la 010 en local → regenerar `schema.sql` → commit → aplicar la 010 en Neon → push. El backend anterior funciona con ella aplicada; el nuevo SIN ella da 500 solo en `?sort=newest` (la portada se queda sin «Novedades»).

No hay herramienta de migraciones ni tabla de control: hay que llevar la cuenta de cuál es la última aplicada en cada entorno.

## Regenerar `schema.sql`

Después de aplicar una migración, se vuelca de nuevo el esquema para que `schema.sql` siga siendo la foto actual:

```bash
pg_dump -U <usuario> -d totebag_db --schema-only --no-owner --no-privileges -f backend/database/schema.sql
```

- `--schema-only`: solo estructura, sin datos de clientes ni pedidos.
- `--no-owner` y `--no-privileges`: el archivo no depende de los roles de la máquina donde se generó.

Se recomienda subir la migración y el `schema.sql` regenerado en el mismo commit.
