-- ============================================================================
-- Registro de qué migró en producción — la deuda que el BACKLOG llama "la que
-- produce todas las anteriores". Gemelo de `supabase/unificacion/33_migraciones_aplicadas.sql`,
-- que es donde de verdad importa (acá en local ya existe `supabase_migrations.schema_migrations`
-- nativo de Supabase; `supabase/unificacion/` no tiene ningún equivalente).
--
-- POR QUÉ AHORA: pasó una tercera vez. `27`, `28`, `29` y `30` ya estaban
-- aplicadas en producción y el BACKLOG seguía diciendo "falta pegar" un día
-- después — mismo agujero que `recibir_lote` (ADR-0004) y
-- `patrimonio_items.categoria` (ADR-0006).
--
-- CONVENCIÓN A PARTIR DE ACÁ: todo archivo nuevo de `supabase/unificacion/`
-- termina con una línea que inserta su propio nombre:
--
--   insert into retail.migraciones_aplicadas (archivo) values ('NN_nombre.sql')
--     on conflict (archivo) do nothing;
--
-- `do nothing` y no `do update`: si el archivo se vuelve a pegar sin saber que
-- ya corrió (como pasó hoy con la 27 y la 28), la fecha que queda es la
-- PRIMERA vez que corrió, no la última — eso es lo que hace útil a la columna.
--
-- Sin RLS con policies: esta tabla no la lee ninguna pantalla de la app, es
-- solo para quien tiene acceso directo al SQL Editor. RLS activado sin ninguna
-- policy la deja invisible por completo a la API — más simple que escribir una
-- policy que solo el Líder pudiera leer y después acordarse de mantenerla.
-- ============================================================================

create table if not exists migraciones_aplicadas (
  archivo text primary key,
  aplicada_at timestamptz not null default now(),
  nota text
);

alter table migraciones_aplicadas enable row level security;
