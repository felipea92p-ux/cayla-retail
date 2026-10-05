-- ============================================================================
-- 20261005100000_pedidos_que_no_se_pierden_parte1_tablas.sql — CAYLA V2 · ADR-0328, actividad 17 (Felipe, 2026-10-04)
-- Traslados: pedidos que no se pierden · PARTE 1 de 3: columnas y tablas (sin funciones, sin políticas).
--
-- EL PROBLEMA PRIMERO. Un pedido entre sedes hoy se puede perder de tres maneras:
--   1. La asesora de TRU pide a AQP la última talla M para un cliente que la espera (ADR-0233). Pedir no reserva nada en
--      AQP: mientras el pedido espera, la caja de AQP la vende, y al otro día AQP contesta «No la tengo». El cliente ya
--      se fue con la promesa.
--   2. Cuando la prenda llega a TRU queda guardada para el cliente, pero nada dice si alguien le avisó.
--   3. Una prenda colgada que se quiere mandar a otra sede primero se sube al almacén (Felipe: «no en un paso»). El
--      segundo paso, el traslado, no lo recuerda nadie: queda en el almacén «para enviar» hasta que alguien se acuerde.
--
-- QUÉ HACE ESTA PARTE (solo el dato; las funciones van en las partes 2 y 3).
--   · `separacion_pedidos.apartado_origen_id`: la prenda queda APARTADA EN LA SEDE QUE LA TIENE desde que se pide
--     (Felipe: «allá la apartan»). Es una fila de `apartados` (ADR-0141), la misma reserva de siempre: la caja de AQP ya
--     no la puede cobrar y «Dónde más hay» deja de ofrecerla a otra sede (`fn_stock_por_sede` cuenta lo disponible).
--   · `separacion_pedidos.avisado_en` / `avisado_por`: cuándo y quién le avisó al cliente cómo terminó su pedido: que su
--     prenda llegó o, si la otra sede dijo «No la tengo» o el envío se cerró sin ella, que no va a llegar.
--   · `separacion_pedidos.cancelado_desde` (decisión del 2026-10-04): de qué lado se cerró sin la prenda: 'pidio' (la
--     tienda que pidió lo dio de baja: el cliente ya no la quiere), 'envia' (la sede que la tenía dijo «No la tengo») o
--     'traslado' (el envío se cerró sin ella). Con 'envia' o 'traslado' la tienda que pidió se entera en Vender y en su
--     Inicio, con «Avisar al cliente que no llegó». Antes solo había un texto libre (`cancelado_motivo`), y un texto no dice
--     quién tiene que avisarle al cliente.
--   · `prendas_para_enviar`: lo que se subió al almacén PARA mandarlo a otra sede. Queda listado hasta que sale en un
--     traslado o alguien dice «ya no la envío».
--   · `prendas_para_enviar_salidas`: qué traslado se llevó cuánto de cada una. Lo que falta enviar NO se guarda: se
--     calcula (cantidad − lo que salió en traslados que no se anularon). Así anular un traslado devuelve la prenda a la
--     lista sin que nadie tenga que acordarse de «reabrirla»: una sola fuente de verdad.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (los niega el esquema, no la pantalla):
--   · una reposición (sin cliente) con una reserva en el origen: el apartado es del cliente que espera;
--   · un aviso al cliente de un pedido sin cliente, o de uno que ni llegó ni se cerró sin la prenda por la otra sede o el
--     envío (lo que la tienda que pidió canceló no se le «avisa que no llegó»: fue su decisión con el cliente);
--   · un pedido «cerrado sin la prenda» que no está cancelado, o uno que llegó y dice que la otra sede no la tenía;
--   · una prenda «para enviar» a su misma sede, con cantidad 0, o cancelada sin motivo (o con motivo sin cancelar);
--   · la misma salida contada dos veces para la misma prenda (único por prenda y línea de traslado).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. En el SQL Editor, tal cual (trae `retail.` y `set search_path`), ANTES de las partes 2
-- y 3 y antes de fusionar la web. Solo `alter table … add column / constraint` y `create table`: NINGUNA política ni
-- `drop trigger` (ADR-0195), así que no choca con el Asesor de seguridad. `separacion_pedidos` la leen Apartados y
-- Traslados; el `alter` toma su candado un instante (lock_timeout de 3 s: si alguien la usa, falla limpio y se repite).
-- Idempotente: se puede pegar dos veces. RLS encendida y SIN políticas en las dos tablas nuevas: solo se leen y escriben
-- por funciones `security definer`.
--
-- SE ROMPE SI alguien libera a mano (Existencias ▸ Apartados) la reserva que el pedido hizo en el origen: la columna sigue
-- apuntando a un apartado ya liberado. Las funciones de la parte 2 lo toleran (solo sueltan lo que sigue abierto; al
-- enviar o subir al almacén la vuelven a apartar si sigue libre) y la pantalla lo dice («ya no está apartada»), pero
-- mientras tanto la prenda vuelve a poder venderse en el origen.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. separacion_pedidos: la reserva en el origen y el aviso al cliente
-- ---------------------------------------------------------------------------
alter table retail.separacion_pedidos add column if not exists apartado_origen_id uuid references retail.apartados (id);
alter table retail.separacion_pedidos add column if not exists avisado_en timestamptz;
alter table retail.separacion_pedidos add column if not exists avisado_por uuid references public.personas (id);

-- La reserva en el origen es del cliente que espera: una reposición (sin cliente) no aparta nada en la otra sede.
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_reserva_origen_solo_con_cliente;
alter table retail.separacion_pedidos add constraint separacion_pedidos_reserva_origen_solo_con_cliente
  check (apartado_origen_id is null or clienta_nombres is not null);

-- De qué lado se cerró sin la prenda (decisión del 2026-10-04): solo un pedido cancelado lo tiene, con uno de tres valores.
-- Las filas canceladas antes de esta columna quedan sin él (null = no se sabe): a esas no se les pide avisar a nadie.
alter table retail.separacion_pedidos add column if not exists cancelado_desde text;
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_cancelado_desde_valido;
alter table retail.separacion_pedidos add constraint separacion_pedidos_cancelado_desde_valido
  check (cancelado_desde is null or (estado = 'cancelado' and cancelado_desde in ('pidio', 'envia', 'traslado')));
-- Lo que llegó solo lo puede dar de baja la tienda que pidió: nunca «la otra sede no la tenía» ni «el envío no la trajo».
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_no_llego_si_llego;
alter table retail.separacion_pedidos add constraint separacion_pedidos_no_llego_si_llego
  check (cancelado_desde is null or cancelado_desde = 'pidio' or llego_en is null);

-- Se le avisa a un cliente cómo terminó su pedido: tiene que haber cliente y, o llegó, o se cerró sin la prenda por la
-- otra sede o por el envío. Lo que la tienda que pidió canceló (el cliente ya no la quería) no tiene aviso que dar.
-- El `coalesce` no es adorno: con `cancelado_desde` nulo, `null in (…)` da NULL y un CHECK que da NULL DEJA PASAR la fila.
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_aviso_con_cliente_y_llegada;
alter table retail.separacion_pedidos add constraint separacion_pedidos_aviso_con_cliente_y_llegada
  check (avisado_en is null or (clienta_nombres is not null and (llego_en is not null or coalesce(cancelado_desde, '') in ('envia', 'traslado'))));

create index if not exists separacion_pedidos_apartado_origen_idx
  on retail.separacion_pedidos (apartado_origen_id) where apartado_origen_id is not null;

comment on column retail.separacion_pedidos.apartado_origen_id is
  'ADR-0328 act. 17: la reserva (fila de apartados) en la sede que ENVÍA, hecha al pedir para un cliente («allá la apartan»). Se suelta al salir el traslado o al cancelar; al anular el traslado se vuelve a apartar.';
comment on column retail.separacion_pedidos.avisado_en is
  'ADR-0328 act. 17: cuándo se le avisó al cliente cómo terminó su pedido (WhatsApp desde Vender): que llegó (llego_en) o que no va a llegar (cancelado_desde envia | traslado). Null = nadie le avisó todavía.';
comment on column retail.separacion_pedidos.cancelado_desde is
  'ADR-0328 act. 17 (2026-10-04): de qué lado se cerró sin la prenda: pidio (la tienda que pidió), envia (la sede que la tenía: «No la tengo») o traslado (el envío se cerró sin ella). Con envia o traslado, la tienda que pidió le avisa al cliente que no llegó. Null en lo cancelado antes de la columna y en la reposición cancelada por grupo.';

-- ---------------------------------------------------------------------------
-- 2. prendas_para_enviar: lo subido al almacén para mandarlo a otra sede
-- ---------------------------------------------------------------------------
create table if not exists retail.prendas_para_enviar (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),           -- la sede que la subió y la enviará
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),   -- a qué sede va
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  nota text check (nota is null or char_length(nota) <= 200),
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  cancelado_en timestamptz,
  cancelado_por uuid references public.personas (id),
  cancelado_motivo text check (cancelado_motivo is null or char_length(cancelado_motivo) <= 200),
  token_cliente uuid unique,
  constraint prendas_para_enviar_otra_sede check (ubicacion_destino_id <> ubicacion_id),
  constraint prendas_para_enviar_cancelacion_coherente check ((cancelado_en is null) = (cancelado_motivo is null))
);
create index if not exists prendas_para_enviar_pendientes_idx
  on retail.prendas_para_enviar (ubicacion_id, ubicacion_destino_id, variante_id, created_at) where cancelado_en is null;
alter table retail.prendas_para_enviar enable row level security;
revoke all on retail.prendas_para_enviar from anon, authenticated;

comment on table retail.prendas_para_enviar is
  'ADR-0328 act. 17 (Felipe: lo colgado se manda en dos pasos): lo que una sede subió al almacén PARA enviarlo a otra. Se lista mientras falte enviar algo (cantidad − salidas de traslados no anulados) y no se haya cancelado. Solo por funciones security definer.';

create table if not exists retail.prendas_para_enviar_salidas (
  id uuid primary key default gen_random_uuid(),
  prenda_para_enviar_id uuid not null references retail.prendas_para_enviar (id),
  transferencia_item_id uuid not null references retail.transferencia_items (id),
  cantidad integer not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  constraint prendas_para_enviar_salidas_una_vez unique (prenda_para_enviar_id, transferencia_item_id)
);
create index if not exists prendas_para_enviar_salidas_item_idx on retail.prendas_para_enviar_salidas (transferencia_item_id);
alter table retail.prendas_para_enviar_salidas enable row level security;
revoke all on retail.prendas_para_enviar_salidas from anon, authenticated;

comment on table retail.prendas_para_enviar_salidas is
  'ADR-0328 act. 17: qué línea de traslado se llevó cuánto de cada prenda «para enviar». La escribe el disparador de transferencia_items; una salida de un traslado anulado deja de contar sola (se mira el estado del traslado al leer).';
