-- ============================================================================
-- ADR-0113 — El ENVÍO: una recepción puede traer comprobantes de VARIOS proveedores
--
-- POR QUÉ. Hasta hoy «una guía = un lote = un proveedor»: `recibir_compras` levanta
-- «Una recepción cubre facturas de un solo proveedor» y `lotes.proveedor_id` es NOT NULL.
-- Pero lo que llega a la puerta es un ENVÍO — una agencia, una guía, varios bultos — y en
-- un mismo envío pueden venir comprobantes de proveedores distintos (Felipe, 2026-09-18).
-- La guía es del envío, no de cada proveedor: nadie recibe «la guía de Textiles Andina».
--
-- DECIDÍ: el LOTE sigue siendo de UN proveedor y el envío es el padre que agrupa un lote
-- por proveedor: `envios` + `lotes.envio_id`.
--   · De «lote = un proveedor» cuelgan el lead time del reorden (`lotes.fecha_recepcion`
--     + `movimientos.compra_item_id`), las vistas de recepción por proveedor y la
--     confiabilidad de cada uno (entregas completas, días de entrega). Con el lote
--     intacto, nada de eso cambia ni se recalcula.
--   · El envío agrega lo único que faltaba: la guía única, quién recibió, cuándo, y la
--     llave de idempotencia (`token_cliente`, mismo patrón que `ventas` y `cambios`).
-- DESCARTÉ: (a) quitar el NOT NULL de `lotes.proveedor_id` o permitir varios proveedores
--   por lote — mezclaría en una fila el costo, el atraso y el faltante de proveedores
--   distintos y rompería las métricas por proveedor; (b) que la pantalla parta el envío en
--   N llamadas a `recibir_compras` — si la segunda falla, la primera ya quedó registrada
--   (una recepción a medias); (c) una columna nueva en `movimientos` para «regalo» — el
--   libro es núcleo (principio 1) y no se toca por un atributo que solo aplica a lo que
--   llega fuera de comprobante.
-- SE ROMPE SI: alguien inserta lotes con `envio_id` desde fuera de `recibir_envio` (un
--   envío sin su guía o con un lote de otra ubicación), o si se borra un envío (los lotes
--   y movimientos quedan sin padre). Nada se borra: son libros append-only, sin política
--   de escritura para nadie — solo `recibir_envio` (security definer) escribe.
--
-- LO QUE TRAE, además del envío:
--   · `envio_extras`: lo que llegó FUERA de comprobante, con su origen — de qué proveedor
--     y si es REGALO. Un regalo entra al stock pero NO al costo promedio (no hay costo que
--     promediar) y no se cuenta como «sin costo» faltante: fue intencional.
--   · `envio_traslados`: lo que llegó de OTRA sede de CAYLA («envío interno»). No crea
--     stock de la nada: confirma un traslado en tránsito (ADR-0068), así el stock del
--     origen ya bajó y el total de la empresa no se duplica (principios 2 y 4).
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe (y con el
-- prefijo `retail.` en el SQL Editor, ver CLAUDE.md).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. el envío ====================
create table envios (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references ubicaciones (id),
  numero_guia text,
  nota text,
  recibido_por uuid references public.personas (id),
  fecha_recepcion timestamptz not null default now(),
  token_cliente uuid
);

create unique index envios_token_cliente_key on envios (token_cliente) where token_cliente is not null;
create index envios_ubicacion_fecha_idx on envios (ubicacion_id, fecha_recepcion desc);

comment on table envios is
  'Una llegada a la puerta (ADR-0113): una guía, una ubicación, comprobantes de uno o varios proveedores. Agrupa un lote por proveedor. Append-only: solo recibir_envio escribe.';
comment on column envios.numero_guia is 'La guía del envío (de la agencia o del proveedor); una sola para todo el envío. Se copia a cada lote.';
comment on column envios.token_cliente is 'Llave de idempotencia generada por la pantalla: reintentar con el mismo token no duplica el stock (mismo patrón que ventas.token_cliente).';

-- ==================== 2. el lote sabe de qué envío viene ====================
alter table lotes add column envio_id uuid references envios (id);
create index lotes_envio_idx on lotes (envio_id) where envio_id is not null;

comment on column lotes.envio_id is
  'El envío al que pertenece este lote (ADR-0113). NULL en los lotes anteriores y en los de Ingreso sin comprobante. Un envío tiene como mucho un lote por proveedor.';

-- ==================== 3. lo que llegó fuera de comprobante ====================
create table envio_extras (
  movimiento_id uuid primary key references movimientos (id),
  envio_id uuid not null references envios (id),
  proveedor_id uuid not null references proveedores (id),
  es_regalo boolean not null default false,
  nota text
);

create index envio_extras_envio_idx on envio_extras (envio_id);

comment on table envio_extras is
  'Prendas que llegaron en el envío pero no figuran en ningún comprobante (ADR-0076), con su origen: el proveedor que las mandó y si son regalo (ADR-0113). Una fila por movimiento de entrada; el movimiento vive en el lote de ese proveedor.';
comment on column envio_extras.es_regalo is 'Regalo del proveedor: entra al stock sin costo, no entra al costo promedio ni cuenta como «sin costo» pendiente de completar.';

-- ==================== 4. lo que llegó de otra sede ====================
create table envio_traslados (
  envio_id uuid not null references envios (id),
  transferencia_id uuid not null references transferencias (id),
  primary key (envio_id, transferencia_id)
);

comment on table envio_traslados is
  'Traslados internos (de otra sede de CAYLA) que se contaron y confirmaron dentro de este envío (ADR-0113 + ADR-0068). El stock lo mueve el traslado, no esta tabla.';

-- ==================== 5. RLS: lectura por sede, escritura ninguna ====================
alter table envios enable row level security;
alter table envio_extras enable row level security;
alter table envio_traslados enable row level security;

create policy envios_select on envios for select
  using (fn_puede_operar_ubicacion(ubicacion_id));

create policy envio_extras_select on envio_extras for select
  using (exists (
    select 1 from envios e
    where e.id = envio_extras.envio_id and fn_puede_operar_ubicacion(e.ubicacion_id)
  ));

create policy envio_traslados_select on envio_traslados for select
  using (exists (
    select 1 from envios e
    where e.id = envio_traslados.envio_id and fn_puede_operar_ubicacion(e.ubicacion_id)
  ));

-- Capa 2: privilegios. `recibir_envio` es `security definer` (corre como el dueño) y no
-- necesita que `authenticated` pueda escribir.
revoke insert, update, delete, truncate on envios from authenticated, anon;
revoke insert, update, delete, truncate on envio_extras from authenticated, anon;
revoke insert, update, delete, truncate on envio_traslados from authenticated, anon;
