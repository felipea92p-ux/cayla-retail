-- ============================================================================
-- 20261116212000 — Un cambio con diferencia emite su nota de crédito y su comprobante nuevo · PARTE 1 de 3: columnas (ADR-0671)
--
-- EL PROBLEMA. Un cambio cobra o devuelve la diferencia sin ningún comprobante: la boleta original sigue diciendo la prenda de antes y lo
--   cobrado de más entra sin documento (13 de 25 cambios al 2026-11-16).
--
-- LO QUE HACE ESTA PARTE (solo esquema; las funciones van en la parte 2):
--   1. `comprobantes.cambio_id`: de qué cambio sale un documento. El comprobante nuevo de un cambio nace con `venta_id` null y este dato;
--      la nota de crédito, con su original y este dato. Así nada de esto pasa por una venta ni por el stock.
--   2. Un índice único: a lo sumo un comprobante nuevo y una nota por cambio, en cualquier estado. Una nota rechazada se reenvía en la
--      misma fila; nunca se emite otra.
--   3. `cambio_notas`: los datos congelados de la nota de crédito de un cambio (original, motivo, ítems, total, quién firma), escritos en el
--      mismo guardado del cambio. La nota se emite en el acto si la original ya está aceptada por SUNAT; si no, la emite el barrido. «Por
--      emitir» = hay fila aquí y todavía no hay nota con ese cambio_id. Solo la leen y la escriben funciones security definer: RLS
--      encendido y sin políticas.
--
-- CÓMO SE PEGA. Una sola ejecución, ANTES de la parte 2. Idempotente. `lock_timeout` 3 s: si choca con una venta en curso, se vuelve a
--   pegar igual. Sin políticas ni disparadores (ADR-0195). Agregar la columna con su llave toma un candado breve sobre `comprobantes` y
--   `cambios` (son chicas: ~2 400 y ~25 filas).
-- ============================================================================

set lock_timeout = '3s';

alter table retail.comprobantes add column if not exists cambio_id uuid references retail.cambios(id);

comment on column retail.comprobantes.cambio_id is
  'ADR-0671: el cambio del que sale este documento (su comprobante nuevo, con venta_id null, o su nota de crédito sobre la original). Null en todo lo demás.';

create index if not exists comprobantes_cambio_idx on retail.comprobantes (cambio_id) where cambio_id is not null;

create unique index if not exists comprobantes_un_documento_por_rol_del_cambio
  on retail.comprobantes (cambio_id, (tipo = 'nota_credito')) where cambio_id is not null;

create table if not exists retail.cambio_notas (
  cambio_id uuid primary key references retail.cambios(id),
  comprobante_original_id uuid not null references retail.comprobantes(id),
  motivo text not null check (motivo in ('06', '07')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  total numeric not null check (total > 0),
  usuario_id uuid,
  created_at timestamptz not null default now(),
  intentos integer not null default 0,
  ultimo_intento_at timestamptz,
  ultimo_error text
);

comment on table retail.cambio_notas is
  'ADR-0671: la nota de crédito que un cambio con diferencia le debe a su comprobante original, congelada al guardar el cambio. Por emitir mientras no exista una nota con ese cambio_id; la emite fn_emitir_nota_del_cambio (en el acto o desde el barrido). intentos y ultimo_error los anota el barrido si falla.';

create index if not exists cambio_notas_original_idx on retail.cambio_notas (comprobante_original_id);

alter table retail.cambio_notas enable row level security;
