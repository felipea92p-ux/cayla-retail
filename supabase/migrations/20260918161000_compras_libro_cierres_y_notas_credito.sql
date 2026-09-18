-- ============================================================================
-- Compras (ADR-0104, D2 y D3): el libro de cierres de línea y notas de crédito
--
-- EL PROBLEMA. Un comprobante de proveedor que llega corto ("facturó 24, llegaron
-- 20") se quedaba `parcial` para siempre: no había forma de decir "estas 4 no van
-- a llegar" ni de bajar lo que se le debe al proveedor por esas 4 (nota de crédito).
-- Y el saldo de un comprobante solo sabía de pagos.
--
-- LA SOLUCIÓN es el mismo patrón que ya usan `movimientos`/`stock` y `compra_pagos`/
-- `compras.pagado` (principio 4): dos tablas nuevas que son la VERDAD y son
-- append-only, y una foto en `compras` mantenida por triggers (migración siguiente).
--   · `compra_item_cierres`  → "estas N unidades de esta línea no van a llegar".
--   · `compra_notas_credito` → el documento legal del proveedor que baja la deuda
--     (serie-número, fecha, monto con el IGV desglosado).
-- Ninguna se edita ni se borra: un error se corrige registrando otro documento,
-- igual que un movimiento de stock se corrige con uno de signo contrario.
--
-- APPEND-ONLY, EN TRES CAPAS (no dos):
--   1. RLS: solo política de lectura, como `compra_pagos`. Sin política de insert/
--      update/delete, `authenticated` no escribe nada por PostgREST.
--   2. Privilegios: además se le quita insert/update/delete a `authenticated` — si
--      alguien agrega una política de escritura por error, el privilegio sigue negado.
--   3. Trigger BEFORE UPDATE/DELETE que lanza excepción: frena incluso al rol dueño
--      y a `service_role`. Solo escriben las RPC (`security definer`), y solo INSERT.
--
-- ESTA MIGRACIÓN es solo el modelo (tablas + las dos columnas de la foto + el
-- `pago_grupo_id` del pago por lote). Los triggers que mantienen la foto, las
-- columnas generadas (`saldo`, `estado_pago`, `estado_recepcion`) y las vistas
-- van en la siguiente; las RPC, después. Se separó así para que quien lee estas
-- tablas (indicadores, IGV del mes) pueda apoyarse en ellas desde el primer paso.
--
-- SE ROMPE SI: alguien inserta en estas tablas saltándose las RPC (por ejemplo desde
-- el SQL Editor como `postgres`) — el trigger de la migración siguiente igual
-- mantiene la foto, pero se salta las validaciones de saldo y de pendiente.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. pago por lote (D3): la columna que agrupa ====================
-- Una transferencia que paga varios comprobantes del mismo proveedor deja una fila
-- de `compra_pagos` por comprobante (el historial de cada uno queda intacto) y
-- todas comparten este id: conciliar con el banco = comparar UNA línea con UNA suma.
-- Nulo en los pagos individuales de siempre.
alter table compra_pagos add column pago_grupo_id uuid;
create index compra_pagos_grupo_idx on compra_pagos (pago_grupo_id) where pago_grupo_id is not null;

comment on column compra_pagos.pago_grupo_id is
  'Identifica un pago por lote (registrar_pago_compras): todas las filas de una misma transferencia comparten este id. Nulo en pagos individuales. Es también el token de idempotencia del lote.';

-- ==================== 2. la foto: dos columnas nuevas en compras ====================
-- Nadie las escribe a mano — solo los triggers de la migración siguiente (mismo
-- contrato que `pagado`). `recalcular_compras()` las reconstruye desde la verdad.
alter table compras
  add column notas_credito numeric(12, 2) not null default 0 check (notas_credito >= 0),
  add column cerrado_cantidad integer not null default 0 check (cerrado_cantidad >= 0);

comment on column compras.notas_credito is
  'Suma de compra_notas_credito.monto de este comprobante. Foto mantenida por trigger; resta del saldo.';
comment on column compras.cerrado_cantidad is
  'Suma de compra_item_cierres.cantidad de las líneas de este comprobante. Foto mantenida por trigger; cuenta como "resuelto" en estado_recepcion.';

-- ==================== 3. compra_item_cierres ====================
create table compra_item_cierres (
  id uuid primary key default gen_random_uuid(),
  compra_item_id uuid not null references compra_items (id),
  cantidad integer not null check (cantidad > 0),
  motivo text not null check (motivo in ('no_llego', 'danada', 'error_proveedor')),
  nota text,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now()
);
create index compra_item_cierres_item_idx on compra_item_cierres (compra_item_id);

comment on table compra_item_cierres is
  'Libro append-only: "estas N unidades de esta línea de comprobante no van a llegar" (ADR-0104 D2). pendiente = cantidad - recibido - cerrado. No cambia stock (no es un movimiento); solo cierra lo que faltaba.';

-- ==================== 4. compra_notas_credito ====================
create table compra_notas_credito (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras (id),
  cierre_id uuid references compra_item_cierres (id),
  serie_numero text not null check (btrim(serie_numero) <> ''),
  fecha date not null,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  igv numeric(12, 2) not null check (igv >= 0),
  monto numeric(12, 2) not null check (monto > 0),
  -- Solo de la base: la nota de crédito puede ser por faltante (la de D2), por una
  -- devolución al proveedor (ADR-0094) o por un descuento posterior.
  motivo text not null check (motivo in ('faltante', 'devolucion', 'descuento', 'otro')),
  nota text,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now(),
  -- El monto es con IGV: total del documento = base + IGV. Mismo invariante que
  -- `compras_total_cuadra`.
  constraint compra_notas_credito_monto_cuadra check (monto = subtotal + igv),
  unique (compra_id, serie_numero)
);
create index compra_notas_credito_compra_idx on compra_notas_credito (compra_id);
create index compra_notas_credito_cierre_idx on compra_notas_credito (cierre_id) where cierre_id is not null;

comment on table compra_notas_credito is
  'Libro append-only: notas de crédito del proveedor contra un comprobante (ADR-0104 D2). saldo = total - pagado - suma(monto). El IGV de la nota resta del crédito fiscal del mes en que se registra.';

-- ==================== 5. RLS: lectura como compra_pagos, escritura ninguna ====================
alter table compra_item_cierres enable row level security;
alter table compra_notas_credito enable row level security;

create policy compra_item_cierres_select on compra_item_cierres for select
  using (exists (
    select 1
    from compra_items ci
    join compras c on c.id = ci.compra_id
    where ci.id = compra_item_cierres.compra_item_id
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  ));

create policy compra_notas_credito_select on compra_notas_credito for select
  using (exists (
    select 1 from compras c
    where c.id = compra_notas_credito.compra_id
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  ));

-- Capa 2: privilegios. Las RPC son `security definer` (corren como el dueño), no
-- necesitan que `authenticated` pueda escribir.
revoke insert, update, delete, truncate on compra_item_cierres from authenticated, anon;
revoke insert, update, delete, truncate on compra_notas_credito from authenticated, anon;

-- ==================== 6. capa 3: el trigger que las vuelve inmutables ====================
create function retail.fn_libro_compras_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Los cierres de línea y las notas de crédito no se editan ni se borran. '
    'Para corregir un error, registra un documento nuevo — así queda constancia de qué pasó.';
end;
$$;

create trigger compra_item_cierres_inmutables
  before update or delete on compra_item_cierres
  for each row execute function retail.fn_libro_compras_es_inmutable();

create trigger compra_notas_credito_inmutables
  before update or delete on compra_notas_credito
  for each row execute function retail.fn_libro_compras_es_inmutable();
