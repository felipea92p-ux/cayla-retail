-- ============================================================================
-- 20260917140002_insumos_taller_reconstruido.sql — CAYLA V2
--
-- Insumos del Taller (D-47 · materia prima) YA EXISTE en producción — verificado
-- el 2026-09-17 consultando directo `vovjyyiafkxteijimpuy` (information_schema,
-- pg_constraint, pg_policies, pg_get_functiondef). Igual que le pasó una vez a
-- Producción del Taller (ADR-0051): alguien lo escribió y lo aplicó sin dejar el
-- `.sql` en ningún branch de git. Este archivo se reconstruyó desde la base real,
-- carácter por carácter en lo que a Postgres le importa; los comentarios de
-- cabecera y de sección son nuevos, agregados en la reconstrucción — no venían
-- con la migración original.
--
-- OJO — hay una TERCERA versión, distinta e incompatible, en el worktree
-- `cayla-invoices-module-review-451aa5`
-- (`supabase/migrations/20260917124059_materia_prima_taller.sql`): usa
-- `insumos.unidad`/`activo` en vez de `unidad_medida`/`archivado_at`, no tiene
-- lotes (usa un `insumo_stock` agregado en vez de PEPS por lote), y sus
-- funciones se llaman `recibir_insumos`/`registrar_consumo_insumos`/
-- `fn_aplicar_movimiento_insumo`. **Este archivo documenta lo que YA CORRE en
-- producción, no la de ese worktree.** No aplicar los dos: los nombres de tabla
-- (`retail.insumos`, `retail.movimientos_insumo`/`retail.insumo_movimientos`)
-- chocan. Cuál de las dos versiones queda — esta o la del otro worktree — es una
-- decisión de Felipe, no algo que este archivo resuelva.
--
-- Qué hace:
--   · `insumos` — el catálogo: tela o avío, con proveedor de referencia, unidad
--     de medida cerrada, % de merma esperado (nunca 50% o más: sería un error de
--     tipeo, no un dato real) y stock mínimo. Se archiva (`archivado_at`), nunca
--     se borra (D-07).
--   · `insumo_lotes` — cada entrada es un lote con su propio costo: PEPS por
--     lote, no promedio. Es la opción "costo por lote" de D-45 aplicada a
--     materia prima — distinta de `fn_recalcular_costo_variante` (promedio
--     ponderado), que es la que se usa para `variantes.costo`.
--   · `movimientos_insumo` — el ledger append-only, calcado de `movimientos`
--     (D-22: no se edita ni se borra, se corrige con signo contrario y motivo).
--     El CHECK `movimientos_insumo_produccion_segun_tipo` ya anticipa los tipos
--     `consumo`/`devolucion` ligados a una `producciones.id` — pero HOY NINGUNA
--     función los escribe. Ver "Lo que falta" abajo.
--   · `v_insumo_saldos` — cuánto hay y cuánto vale, por insumo y ubicación,
--     sumando el ledger. Nunca una columna que alguien pise (mismo principio que
--     `stock` sobre `movimientos`).
--   · `recibir_insumo` — entra un lote (de compra o saldo inicial), con su
--     propio costo unitario.
--   · `ajustar_insumo_por_conteo` — reconcilia el físico contado contra
--     `v_insumo_saldos`; valoriza la diferencia al costo promedio de lo que hay
--     hoy, no al de un lote puntual (el conteo no distingue de qué rollo salió
--     la diferencia).
--
-- Lo que falta, y por lo que D-47 sigue sin cerrarse del todo (ver
-- `docs/datos/modulos/10-produccion-del-taller.md`, Hueco 2): no existe todavía
-- una función que consuma insumos al cortar y los ligue a una `produccion_id`.
-- `cerrar_produccion` (`20260915130000` / redefinida en `20260916090000`) sigue
-- recibiendo `costo_tela`/`costo_avios`/`costo_maquila` como números sueltos —
-- el puente entre este archivo y ese no existe todavía. El catálogo y la
-- recepción están construidos; el consumo real, no.
--
-- ESTADO: verificado en producción el 2026-09-17. NO aplicado en el Postgres
-- local de esta rama con este archivo — se reconstruyó para que el repo deje de
-- estar ciego sobre esto, no porque ya se haya corrido acá. Antes de correrlo en
-- cualquier base, confirmar con Felipe que esta es la versión vigente (ver la
-- nota sobre la tercera versión, arriba).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- insumos ----------
create table retail.insumos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  tipo          text not null check (tipo in ('tela', 'avio')),
  unidad_medida text not null check (unidad_medida in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena')),
  proveedor_id  uuid references retail.proveedores (id),
  merma_pct     numeric(5,4) not null default 0 check (merma_pct >= 0 and merma_pct < 0.5),
  stock_minimo  numeric(12,3) check (stock_minimo is null or stock_minimo >= 0),
  archivado_at  timestamptz,
  nota          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table retail.insumos is
  'Catálogo de materia prima del Taller: tela y avíos. No es vendible, no cuelga de `variantes` — hermana de `productos`, no la misma tabla.';

create function retail.fn_insumos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger insumos_set_updated_at
  before update on retail.insumos
  for each row execute function retail.fn_insumos_set_updated_at();

alter table retail.insumos enable row level security;

create policy insumos_select_autenticado on retail.insumos
  for select using (auth.role() = 'authenticated');

create policy insumos_insert_lider on retail.insumos
  for insert with check (retail.fn_es_lider());

create policy insumos_update_lider on retail.insumos
  for update using (retail.fn_es_lider());

grant select, insert, update, delete on retail.insumos to authenticated;
grant all on retail.insumos to service_role;

-- ---------- insumo_lotes ----------
create table retail.insumo_lotes (
  id                 uuid primary key default gen_random_uuid(),
  insumo_id          uuid not null references retail.insumos (id),
  ubicacion_id       uuid not null references retail.ubicaciones (id),
  codigo_lote        text,
  proveedor_id       uuid references retail.proveedores (id),
  cantidad_ingresada numeric(12,3) not null check (cantidad_ingresada > 0),
  costo_unitario     numeric(12,4) not null check (costo_unitario >= 0),
  documento          text,
  fecha_ingreso      date not null default current_date,
  origen             text not null default 'compra' check (origen in ('compra', 'saldo_inicial')),
  nota               text,
  created_at         timestamptz not null default now()
);

comment on table retail.insumo_lotes is
  'Cada fila es un lote propio con su costo — PEPS por lote, no promedio. Es la mitad de D-45 que le toca a la materia prima.';

create unique index insumo_lotes_codigo_unico on retail.insumo_lotes (insumo_id, codigo_lote) where codigo_lote is not null;
create index insumo_lotes_insumo_ubicacion_idx on retail.insumo_lotes (insumo_id, ubicacion_id);

alter table retail.insumo_lotes enable row level security;

create policy insumo_lotes_select on retail.insumo_lotes
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id));

grant select, insert, update, delete on retail.insumo_lotes to authenticated;
grant all on retail.insumo_lotes to service_role;

-- ---------- movimientos_insumo ----------
create table retail.movimientos_insumo (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid not null references retail.insumos (id),
  insumo_lote_id uuid references retail.insumo_lotes (id),
  ubicacion_id   uuid not null references retail.ubicaciones (id),
  tipo           text not null check (tipo in ('compra', 'consumo', 'devolucion', 'merma', 'ajuste')),
  cantidad       numeric(12,3) not null,
  costo_unitario numeric(12,4) not null default 0 check (costo_unitario >= 0),
  produccion_id  uuid references retail.producciones (id),
  usuario_id     uuid references personas (id),
  motivo         text,
  nota           text,
  created_at     timestamptz not null default now(),
  -- El signo lo decide `tipo`, no quien escribe la fila: un ajuste puede ser
  -- negativo (mermó más de lo esperado), todo lo demás siempre es positivo.
  constraint movimientos_insumo_cantidad_segun_tipo check (
    (tipo = 'ajuste' and cantidad <> 0) or (tipo <> 'ajuste' and cantidad > 0)
  ),
  constraint movimientos_insumo_ajuste_con_motivo check (
    tipo <> 'ajuste' or (motivo is not null and length(trim(motivo)) > 0)
  ),
  -- Toda entrada/salida real viene de un lote puntual, para saber a qué costo
  -- valorizarla; un ajuste no, porque el conteo no distingue de qué lote salió
  -- la diferencia.
  constraint movimientos_insumo_lote_obligatorio check (
    tipo = 'ajuste' or insumo_lote_id is not null
  ),
  -- `consumo`/`devolucion` solo tienen sentido ligados a una corrida de
  -- producción; `compra`/`merma`/`ajuste` nunca lo están.
  constraint movimientos_insumo_produccion_segun_tipo check (
    (tipo in ('consumo', 'devolucion') and produccion_id is not null)
    or (tipo in ('compra', 'merma', 'ajuste') and produccion_id is null)
  )
);

comment on table retail.movimientos_insumo is
  'Ledger append-only del consumo de materia prima, calcado de `movimientos`. Los tipos consumo/devolucion existen en el CHECK pero ninguna función los escribe todavía — ver el encabezado de este archivo.';

create index movimientos_insumo_insumo_ubicacion_idx on retail.movimientos_insumo (insumo_id, ubicacion_id);
create index movimientos_insumo_lote_idx on retail.movimientos_insumo (insumo_lote_id, tipo);
create index movimientos_insumo_produccion_idx on retail.movimientos_insumo (produccion_id) where produccion_id is not null;

alter table retail.movimientos_insumo enable row level security;

create policy movimientos_insumo_select on retail.movimientos_insumo
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id));

grant select, insert, update, delete on retail.movimientos_insumo to authenticated;
grant all on retail.movimientos_insumo to service_role;

-- ---------- v_insumo_saldos ----------
-- Cuánto hay y cuánto vale, por insumo y ubicación. Nunca una columna que
-- alguien pise: se recalcula sola sumando el ledger, igual que `stock` sobre
-- `movimientos`.
create view retail.v_insumo_saldos as
select
  i.id as insumo_id,
  i.codigo,
  i.nombre,
  i.tipo,
  i.unidad_medida,
  m.ubicacion_id,
  sum(case
    when m.tipo in ('compra', 'devolucion') then m.cantidad
    when m.tipo in ('consumo', 'merma') then -m.cantidad
    else m.cantidad
  end) as fisico,
  sum(case
    when m.tipo in ('compra', 'devolucion') then m.cantidad * m.costo_unitario
    when m.tipo in ('consumo', 'merma') then -m.cantidad * m.costo_unitario
    else m.cantidad * m.costo_unitario
  end) as valor
from retail.insumos i
join retail.movimientos_insumo m on m.insumo_id = i.id
group by i.id, i.codigo, i.nombre, i.tipo, i.unidad_medida, m.ubicacion_id;

-- ---------- recibir_insumo ----------
create or replace function retail.recibir_insumo(
  p_insumo_id uuid,
  p_ubicacion_id uuid,
  p_cantidad numeric,
  p_costo_total numeric,
  p_codigo_lote text default null,
  p_proveedor_id uuid default null,
  p_documento text default null,
  p_origen text default 'compra',
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_costo_unitario numeric(12,4);
begin
  -- Mismo candado que ya usa `retail.producciones` (`producciones_select`) y
  -- toda RPC que escribe stock por ubicación (`recibir_lote`, `iniciar_traslado`,
  -- `abrir_caja`...): `retail.fn_puede_operar_ubicacion`.
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar insumos en esa ubicación';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_costo_total is null or p_costo_total < 0 then
    raise exception 'El costo total no puede ser negativo';
  end if;

  v_costo_unitario := round(p_costo_total / p_cantidad, 4);
  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into insumo_lotes (
    insumo_id, ubicacion_id, codigo_lote, proveedor_id, cantidad_ingresada,
    costo_unitario, documento, origen, nota
  ) values (
    p_insumo_id, p_ubicacion_id, nullif(trim(coalesce(p_codigo_lote, '')), ''), p_proveedor_id, p_cantidad,
    v_costo_unitario, p_documento, p_origen, p_nota
  ) returning id into v_lote_id;

  insert into movimientos_insumo (
    insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota
  ) values (
    p_insumo_id, v_lote_id, p_ubicacion_id, 'compra', p_cantidad, v_costo_unitario, v_persona_id, p_nota
  );

  return v_lote_id;
end;
$$;

-- ---------- ajustar_insumo_por_conteo ----------
create or replace function retail.ajustar_insumo_por_conteo(
  p_insumo_id uuid,
  p_ubicacion_id uuid,
  p_cantidad_contada numeric,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona_id uuid;
  v_actual numeric(12,3);
  v_diferencia numeric(12,3);
  v_costo numeric(12,4);
  v_id uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ajustar insumos en esa ubicación';
  end if;
  if p_cantidad_contada is null or p_cantidad_contada < 0 then
    raise exception 'La cantidad contada no puede ser negativa';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Un ajuste sin motivo es un descuadre sin dueño: escribe por qué';
  end if;

  select coalesce(fisico, 0) into v_actual
  from v_insumo_saldos where insumo_id = p_insumo_id and ubicacion_id = p_ubicacion_id;
  v_actual := coalesce(v_actual, 0);
  v_diferencia := round(p_cantidad_contada - v_actual, 3);

  if v_diferencia = 0 then
    return null; -- el conteo coincide: no hay nada que registrar
  end if;

  -- El ajuste se valora al costo promedio de lo que hay hoy, no al de un lote
  -- puntual: no se sabe de qué rollo salió la diferencia.
  select case when coalesce(fisico, 0) <> 0 then round(valor / fisico, 4) else 0 end
    into v_costo
    from v_insumo_saldos where insumo_id = p_insumo_id and ubicacion_id = p_ubicacion_id;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into movimientos_insumo (
    insumo_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, motivo
  ) values (
    p_insumo_id, p_ubicacion_id, 'ajuste', v_diferencia, coalesce(v_costo, 0), v_persona_id, trim(p_motivo)
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function retail.recibir_insumo(uuid, uuid, numeric, numeric, text, uuid, text, text, text) to authenticated;
grant execute on function retail.ajustar_insumo_por_conteo(uuid, uuid, numeric, text) to authenticated;
