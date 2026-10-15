-- ============================================================================
-- 20261015035000_orden_insumo_recepcion_esquema.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 3 (recibir en el Taller contra la
-- orden de insumos). Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 3). Las funciones van en
-- 20261015040000_orden_insumo_recepcion_funciones.sql.
--
-- EL PROBLEMA PRIMERO. Con la actividad 1, el papel de una orden de insumos ya no se recibe por la recepción de siempre (se recibe desde
-- la orden, para que nada entre dos veces), pero la recepción contra la orden no existía: la tela y los avíos de una orden no tenían por
-- dónde entrar al Taller. Y el comprobante no bloquea (decisión 9): lo que llegó se recibe aunque el papel no haya llegado.
--
-- QUÉ HACE (solo el esquema):
--   1. `orden_insumo_recepciones`: el libro de lo que se recibió contra una orden (quién, cuándo, en qué taller, con su nota), como
--      `comprobantes_produccion_recepciones` para el papel suelto del líder. No se edita ni se borra. Solo la leen las funciones
--      `security definer` de 20261015040000: RLS encendido y sin políticas (ADR-0195).
--   2. `insumo_lotes.orden_insumo_item_id` y `insumo_lotes.orden_insumo_recepcion_id`: el lote que abre una recepción contra la orden sabe
--      de qué línea de la orden sale y en qué recepción entró. Lo que el papel de la orden trajo FUERA de la orden (decisión 43) se recibe
--      en la misma recepción y su lote sigue apuntando a la línea del papel (`comprobante_item_id`), como siempre.
--      Un lote viene de UNA recepción: la del papel suelto (`recepcion_id`) o la de una orden, nunca de las dos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261015034000 y antes de 20261015040000. Una tabla nueva y dos
-- columnas en `insumo_lotes`, sin políticas ni `drop trigger` (ADR-0195) y sin `select … into` dentro de textos entre comillas
-- (ADR-0288). Re-ejecutable: se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';

create table if not exists retail.orden_insumo_recepciones (
  id uuid primary key default gen_random_uuid(),
  orden_insumo_id uuid not null references retail.ordenes_insumo (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  nota text,
  usuario_id uuid references public.personas (id),
  token_cliente uuid,
  created_at timestamptz not null default now(),
  constraint orden_insumo_recepciones_token_cliente_key unique (token_cliente),
  constraint orden_insumo_recepciones_nota_larga check (nota is null or length(nota) <= 500)
);
create index if not exists orden_insumo_recepciones_orden_idx on retail.orden_insumo_recepciones (orden_insumo_id);
alter table retail.orden_insumo_recepciones enable row level security;
comment on table retail.orden_insumo_recepciones is
  'Lo que se recibió en el Taller contra una orden de insumos (ADR-0362, fase 7 parte 2). No se edita ni se borra; la leen solo funciones security definer.';

-- El libro no se edita ni se borra: lo que se recibió mal se corrige con un ajuste de inventario, como el de los comprobantes del Taller.
create or replace function retail.fn_orden_insumo_recepcion_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Lo recibido contra una orden de insumos no se edita ni se borra: si algo entró mal, se corrige con un ajuste de inventario'
    using errcode = '42501';
end;
$$;
create or replace trigger orden_insumo_recepciones_inmutable
  before update or delete on retail.orden_insumo_recepciones
  for each row execute function retail.fn_orden_insumo_recepcion_inmutable();

alter table retail.insumo_lotes
  add column if not exists orden_insumo_item_id uuid references retail.orden_insumo_items (id);
alter table retail.insumo_lotes
  add column if not exists orden_insumo_recepcion_id uuid references retail.orden_insumo_recepciones (id);
create index if not exists insumo_lotes_orden_insumo_item_idx
  on retail.insumo_lotes (orden_insumo_item_id) where orden_insumo_item_id is not null;
create index if not exists insumo_lotes_orden_insumo_recepcion_idx
  on retail.insumo_lotes (orden_insumo_recepcion_id) where orden_insumo_recepcion_id is not null;
comment on column retail.insumo_lotes.orden_insumo_item_id is
  'La línea de la orden de insumos de la que sale este lote (recepción contra la orden, ADR-0362 fase 7 parte 2). Null: otro origen.';
comment on column retail.insumo_lotes.orden_insumo_recepcion_id is
  'La recepción contra una orden de insumos que abrió este lote. Null: el lote vino del papel suelto del líder o del saldo inicial.';

-- Un lote viene de una recepción o de la otra, nunca de las dos; y el que sale de una línea de la orden tiene su recepción.
alter table retail.insumo_lotes drop constraint if exists insumo_lotes_una_recepcion;
alter table retail.insumo_lotes add constraint insumo_lotes_una_recepcion
  check (recepcion_id is null or orden_insumo_recepcion_id is null);
alter table retail.insumo_lotes drop constraint if exists insumo_lotes_linea_de_orden_con_recepcion;
alter table retail.insumo_lotes add constraint insumo_lotes_linea_de_orden_con_recepcion
  check (orden_insumo_item_id is null or orden_insumo_recepcion_id is not null);

reset lock_timeout;

-- Comprobación: si algo no quedó, el pegado falla y no se aplica nada.
do $$
begin
  if to_regclass('retail.orden_insumo_recepciones') is null then
    raise exception 'falta retail.orden_insumo_recepciones';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'orden_insumo_item_id')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'orden_insumo_recepcion_id') then
    raise exception 'falta la orden en insumo_lotes';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orden_insumo_recepciones_inmutable') then
    raise exception 'el libro de recepciones de una orden de insumos tiene que ser inmutable';
  end if;
end;
$$;
