-- ============================================================================
-- 20260917124059_materia_prima_taller.sql — CAYLA V2
--
-- D-47 (docs/datos/DECISIONES-2026-09-12.md:242-244): "la tela entra, se
-- descuenta al cortar, y avisa cuando falta". Hoy `producciones.costo_tela`/
-- `costo_avios` son montos que alguien teclea a mano en `abrir_produccion` —
-- nadie sabe cuánta tela queda en el Taller, y el "costo real" que D-31/D-45
-- pegan a la prenda es, en realidad, una estimación con cara de dato.
-- Diseño completo en docs/datos/10-ROADMAP-DATOS.md:274-423 ("Prioridad 2 ·
-- Materia prima del Taller"). Decisiones de este cambio en ADR-0090.
--
-- Qué hace:
--   · `insumos` — catálogo de materia prima (tela/avío/empaque). Hermana de
--     `productos`, no la misma tabla: una tela no se vende, no tiene talla
--     ni color vendible, y no puede entrar a `variantes` sin ensuciar el
--     buscador de la caja (docs/datos/10-ROADMAP-DATOS.md:332-336).
--   · `insumo_stock` — cuánto hay de cada insumo, por ubicación. Cantidad
--     con decimales (numeric): 2,35 metros de tela es una cantidad válida,
--     media prenda no lo es — por eso no se reusa `stock` (integer).
--   · `insumo_movimientos` — historial append-only, calcado de `movimientos`
--     (mismo candado D-22: no se edita ni se borra).
--   · `produccion_insumos` — el puente: qué se consumió en qué corrida y a
--     qué costo. `registrar_consumo_insumos` lo llena y, con eso, deja de
--     ser tecleado `producciones.costo_tela`/`costo_avios` — pasan a ser la
--     suma de lo realmente cortado (ver función, más abajo, por qué solo se
--     pisa el balde que el consumo tocó).
--   · `fn_aplicar_movimiento_insumo` — el motor mecánico, mismo patrón que
--     `fn_aplicar_movimiento` (20260914230000): entrada suma con upsert,
--     salida bloquea la fila con `for update` antes de leer, valida stock
--     suficiente y recién ahí resta. Sin ese lock, dos corridas del Taller
--     cortando la misma tela en el mismo milisegundo podrían leer el mismo
--     "hay 5 metros" antes de que ninguna reste, y las dos saldrían bien
--     con una tela que no alcanzaba para las dos.
--   · `recibir_insumos(p_ubicacion_id, p_items, p_compra_id, p_nota)` —
--     entrada de materia prima. `p_compra_id` (nullable) es el puente con
--     la Prioridad 1 (compras a proveedor) cuando la tela viene facturada;
--     se liga a `compras` (la cabecera), no a `compra_items`, porque
--     `compra_items` es de prendas (`producto_id`/`variante_id`) y no
--     modela insumos — ligar más fino exigiría tocar esa tabla, fuera del
--     alcance de este cambio (ver ADR-0090).
--   · `registrar_consumo_insumos(p_produccion_id, p_items, p_nota)` — el
--     consumo real al cortar. Exige que la orden siga `en_proceso`: se
--     registra ANTES de `cerrar_produccion`, nunca después — así el costo
--     real ya está en `costo_tela`/`costo_avios` cuando `cerrar_produccion`
--     (sin tocarla) hace `coalesce(p_costo_tela, costo_tela)` y preserva lo
--     que esta función calculó. Registrarlo después de cerrada reescribiría
--     `costo_unitario` (columna generada) sin que `variantes.costo` se
--     entere — un estado inconsistente real, no cosmético (principio 2).
--
-- NO se toca `abrir_produccion`/`cerrar_produccion`/`anular_produccion`/
-- `revertir_produccion` (20260915130000): siguen aceptando el costo
-- tecleado como hoy, para el Taller que todavía no registra consumo por
-- insumo. `registrar_consumo_insumos` compone con ellas sin romper el
-- camino existente (principio 1, núcleo estable).
--
-- NO se toca `apps/web/components/NuevaOrdenProduccionForm.tsx` — conectar
-- el formulario a este stock nuevo es trabajo de otra sesión (fuera del
-- alcance: esta migración es solo tablas + RPC).
--
-- SE ROMPE SI: `fn_puede_operar_ubicacion(uuid)` (0003/0006) o
-- `producciones.estado`/estructura (20260915130000) cambian de forma —
-- ambas funciones leen `producciones` directo. Si algún día se permite
-- consumo DESPUÉS de cerrar, hay que decidir ahí mismo cómo se corrige
-- `variantes.costo` retroactivamente (hoy no se permite, a propósito).
--
-- ESTADO: SOLO LOCAL. No aplicada en producción — la pega Felipe cuando
-- decida (D-11), con el prefijo `retail.` en el SQL Editor. Entra al
-- diccionario (`docs/datos/generado/`) cuando se aplique allá.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. insumos: el catálogo ----------
create table retail.insumos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  tipo          text not null check (tipo in ('tela', 'avio', 'empaque')),
  unidad        text not null check (unidad in ('m', 'und', 'kg')),
  stock_minimo  numeric(12,3) not null default 0 check (stock_minimo >= 0),
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table retail.insumos is
  'Catálogo de materia prima del Taller (tela/avío/empaque). Hermana de productos, no la misma tabla — nunca entra a variantes (D-47, docs/datos/10-ROADMAP-DATOS.md:332-336).';

-- ---------- 2. insumo_stock: cuánto hay y dónde ----------
create table retail.insumo_stock (
  insumo_id    uuid not null references retail.insumos (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  cantidad     numeric(12,3) not null default 0 check (cantidad >= 0),
  updated_at   timestamptz not null default now(),
  primary key (insumo_id, ubicacion_id)
);

comment on table retail.insumo_stock is
  'Snapshot derivado de insumo_movimientos — igual que stock respecto de movimientos (principio 4): nunca se edita a mano, se reconstruye sumando el historial.';

-- ---------- 3. insumo_movimientos: el historial, append-only ----------
create table retail.insumo_movimientos (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid not null references retail.insumos (id),
  ubicacion_id   uuid not null references retail.ubicaciones (id),
  tipo           text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad       numeric(12,3) not null,
  costo_unitario numeric(12,4),
  motivo         text,
  produccion_id  uuid references retail.producciones (id),
  compra_id      uuid references retail.compras (id),
  usuario_id     uuid references public.personas (id),
  nota           text,
  created_at     timestamptz not null default now(),
  -- Mismo candado que movimientos_cantidad_valida (0004): entrada/salida
  -- siempre positivas, ajuste puede ser negativo (queda listo para una
  -- futura corrección/conteo de insumos — ninguna RPC de esta migración
  -- emite 'ajuste' todavía).
  constraint insumo_movimientos_cantidad_valida check (
    (tipo <> 'ajuste' and cantidad > 0) or (tipo = 'ajuste' and cantidad <> 0)
  )
);

comment on table retail.insumo_movimientos is
  'Historial append-only de materia prima — calcado de movimientos (D-22): nunca se edita ni se borra, se corrige con una fila de signo contrario.';

create index insumo_movimientos_ubicacion_fecha_idx on retail.insumo_movimientos (ubicacion_id, created_at desc);
create index insumo_movimientos_insumo_idx on retail.insumo_movimientos (insumo_id);
create index insumo_movimientos_produccion_idx on retail.insumo_movimientos (produccion_id) where produccion_id is not null;
create index insumo_movimientos_compra_idx on retail.insumo_movimientos (compra_id) where compra_id is not null;

-- ---------- 4. produccion_insumos: el puente, y la pieza clave de D-47 ----------
create table retail.produccion_insumos (
  id                 uuid primary key default gen_random_uuid(),
  produccion_id      uuid not null references retail.producciones (id),
  insumo_id          uuid not null references retail.insumos (id),
  cantidad_consumida numeric(12,3) not null check (cantidad_consumida > 0),
  costo_unitario     numeric(12,4) not null check (costo_unitario >= 0),
  costo_total        numeric(12,2) generated always as (round(cantidad_consumida * costo_unitario, 2)) stored,
  movimiento_id      uuid references retail.insumo_movimientos (id),
  created_at         timestamptz not null default now()
);

comment on table retail.produccion_insumos is
  'Qué se cortó y a qué costo, por corrida. Append-only a propósito (sin unique por insumo): una orden puede cortarse en varias sesiones antes de cerrar, y cada corte real queda como su propia fila, igual que produccion_lineas registra el plan.';

create index produccion_insumos_produccion_idx on retail.produccion_insumos (produccion_id);
create index produccion_insumos_insumo_idx on retail.produccion_insumos (insumo_id);

-- ---------- 5. RLS: catálogo (select autenticado, escritura líder) ----------
alter table retail.insumos enable row level security;
create policy insumos_select on retail.insumos for select using (auth.role() = 'authenticated');
create policy insumos_write_lider on retail.insumos for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------- 6. RLS: operación (acotada a fn_puede_operar_ubicacion, mismo patrón que producciones/20260915130000 — se escribe solo por RPC, sin policy de insert/update/delete) ----------
alter table retail.insumo_stock enable row level security;
create policy insumo_stock_select on retail.insumo_stock for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.insumo_movimientos enable row level security;
create policy insumo_movimientos_select on retail.insumo_movimientos for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.produccion_insumos enable row level security;
create policy produccion_insumos_select on retail.produccion_insumos for select
  using (
    exists (
      select 1 from retail.producciones p
      where p.id = produccion_insumos.produccion_id
        and retail.fn_puede_operar_ubicacion(p.ubicacion_id)
    )
  );

grant select, insert, update, delete on retail.insumos to authenticated;
grant select, insert, update, delete on retail.insumo_stock to authenticated;
grant select, insert, update, delete on retail.insumo_movimientos to authenticated;
grant select, insert, update, delete on retail.produccion_insumos to authenticated;
grant all on retail.insumos to service_role;
grant all on retail.insumo_stock to service_role;
grant all on retail.insumo_movimientos to service_role;
grant all on retail.produccion_insumos to service_role;

-- ---------- 7. el motor: aplicar UN movimiento de insumo ----------
-- Mismo patrón que fn_aplicar_movimiento (20260914230000): entrada es un
-- upsert aditivo (seguro bajo concurrencia por sí solo, on conflict toma
-- el lock de fila); salida bloquea con `for update` ANTES de leer la
-- cantidad, para que dos corridas cortando la misma tela a la vez se
-- serialicen en vez de leer el mismo stock viejo las dos.
create function retail.fn_aplicar_movimiento_insumo(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  m insumo_movimientos%rowtype;
  v_actual numeric;
begin
  select * into m from insumo_movimientos where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento de insumo % no existe', p_movimiento_id;
  end if;

  if m.tipo = 'entrada' then
    insert into insumo_stock (insumo_id, ubicacion_id, cantidad)
      values (m.insumo_id, m.ubicacion_id, m.cantidad)
      on conflict (insumo_id, ubicacion_id) do update
        set cantidad = insumo_stock.cantidad + excluded.cantidad, updated_at = now();

  elsif m.tipo = 'salida' then
    insert into insumo_stock (insumo_id, ubicacion_id, cantidad)
      values (m.insumo_id, m.ubicacion_id, 0)
      on conflict (insumo_id, ubicacion_id) do nothing;
    select cantidad into v_actual from insumo_stock
      where insumo_id = m.insumo_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual < m.cantidad then
      raise exception 'Stock insuficiente del insumo: hay % y se pide sacar %', v_actual, m.cantidad;
    end if;
    update insumo_stock set cantidad = cantidad - m.cantidad, updated_at = now()
      where insumo_id = m.insumo_id and ubicacion_id = m.ubicacion_id;

  elsif m.tipo = 'ajuste' then
    insert into insumo_stock (insumo_id, ubicacion_id, cantidad)
      values (m.insumo_id, m.ubicacion_id, 0)
      on conflict (insumo_id, ubicacion_id) do nothing;
    select cantidad into v_actual from insumo_stock
      where insumo_id = m.insumo_id and ubicacion_id = m.ubicacion_id
      for update;
    if v_actual + m.cantidad < 0 then
      raise exception 'El ajuste dejaría stock negativo: hay % y el ajuste es %', v_actual, m.cantidad;
    end if;
    update insumo_stock set cantidad = cantidad + m.cantidad, updated_at = now()
      where insumo_id = m.insumo_id and ubicacion_id = m.ubicacion_id;
  end if;
end;
$$;

-- No es opcional: fn_aplicar_movimiento_insumo no valida permiso ni dueño —
-- confía en que quien la llama (recibir_insumos/registrar_consumo_insumos,
-- ambas security definer) ya insertó la fila después de validar negocio.
-- Verificado contra el Postgres local (2026-09-17, ver ADR-0090): SIN este
-- revoke, hasta `anon` (sin sesión) tiene EXECUTE por el otorgamiento
-- automático de Postgres a PUBLIC al crear la función — igual que se
-- encontró y cerró para fn_recalcular_costo_variante en
-- 20260916090000_costo_promedio_ponderado.sql. Un movimiento_id de entrada
-- observado (ej. en una respuesta previa de la API) alcanzaría para
-- reproducirlo y duplicar stock, sin ninguna sesión. Dos fuentes de
-- permiso distintas, hay que cerrar las dos (mismo hallazgo que esa
-- migración): el otorgamiento automático a PUBLIC, y el que
-- 0005_grants.sql da por defecto a `authenticated` para toda función
-- nueva del schema. recibir_insumos/registrar_consumo_insumos siguen
-- pudiendo llamarla: son security definer, corren con el privilegio del
-- dueño — el revoke no las afecta.
revoke all on function retail.fn_aplicar_movimiento_insumo(uuid) from public;
revoke execute on function retail.fn_aplicar_movimiento_insumo(uuid) from authenticated;

-- ---------- 8. recibir_insumos: entrada de materia prima ----------
create function retail.recibir_insumos(
  p_ubicacion_id uuid,
  p_items jsonb,                    -- [{insumo_id, cantidad, costo_unitario}, …]
  p_compra_id uuid default null,    -- puente con Prioridad 1 cuando la tela viene facturada
  p_nota text default null
)
returns integer                     -- cuántos ítems se recibieron
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item jsonb; v_persona uuid; v_mov_id uuid;
  v_cantidad numeric; v_costo numeric; v_n integer := 0;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir insumos en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;
  if p_compra_id is not null and not exists (select 1 from compras where id = p_compra_id) then
    raise exception 'La factura de compra indicada no existe';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::numeric;
    v_costo := (v_item ->> 'costo_unitario')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad recibida de cada insumo debe ser mayor a cero';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Falta el costo unitario del insumo recibido';
    end if;
    if not exists (select 1 from insumos where id = (v_item ->> 'insumo_id')::uuid and activo) then
      raise exception 'El insumo % no existe o está descontinuado', v_item ->> 'insumo_id';
    end if;

    insert into insumo_movimientos (insumo_id, ubicacion_id, tipo, cantidad, costo_unitario, motivo, compra_id, usuario_id, nota)
      values ((v_item ->> 'insumo_id')::uuid, p_ubicacion_id, 'entrada', v_cantidad, v_costo, 'recepcion', p_compra_id, v_persona, p_nota)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento_insumo(v_mov_id);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- ---------- 9. registrar_consumo_insumos: el consumo real al cortar ----------
create function retail.registrar_consumo_insumos(
  p_produccion_id uuid,
  p_items jsonb,              -- [{insumo_id, cantidad, costo_unitario}, …]
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype;
  v_item jsonb;
  v_persona uuid;
  v_mov_id uuid;
  v_cantidad numeric;
  v_costo numeric;
  v_n_tela integer; v_suma_tela numeric;
  v_n_avios integer; v_suma_avios numeric;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  -- Se exige ANTES de cerrar (ver cabecera): así cerrar_produccion, sin
  -- tocarla, preserva el costo real vía coalesce(p_costo_tela, costo_tela).
  if v_orden.estado <> 'en_proceso' then
    raise exception 'El consumo de insumos se registra antes de cerrar la orden — esta ya está %', v_orden.estado;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Indica al menos un insumo consumido';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::numeric;
    v_costo := (v_item ->> 'costo_unitario')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad consumida de cada insumo debe ser mayor a cero';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Falta el costo unitario del insumo consumido';
    end if;
    if not exists (select 1 from insumos where id = (v_item ->> 'insumo_id')::uuid) then
      raise exception 'El insumo % no existe', v_item ->> 'insumo_id';
    end if;

    insert into insumo_movimientos (insumo_id, ubicacion_id, tipo, cantidad, costo_unitario, motivo, produccion_id, usuario_id, nota)
      values ((v_item ->> 'insumo_id')::uuid, v_orden.ubicacion_id, 'salida', v_cantidad, v_costo, 'corte', p_produccion_id, v_persona, p_nota)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento_insumo(v_mov_id);

    insert into produccion_insumos (produccion_id, insumo_id, cantidad_consumida, costo_unitario, movimiento_id)
      values (p_produccion_id, (v_item ->> 'insumo_id')::uuid, v_cantidad, v_costo, v_mov_id);
  end loop;

  -- D-47: costo_tela/costo_avios dejan de ser tecleados y pasan a ser la
  -- suma de lo realmente cortado (empaque se cuenta junto a avíos — no hay
  -- columna propia para packaging en producciones, ver ADR-0090). Solo se
  -- pisa el balde que ESTE consumo tocó (existe al menos una fila de ese
  -- tipo): si el Taller todavía no registra avíos por insumo, el monto
  -- tecleado en abrir_produccion se respeta tal cual — evita que cortar
  -- tela borre en silencio un costo de avíos válido que nadie migró.
  select count(*), coalesce(sum(pi.costo_total), 0) into v_n_tela, v_suma_tela
    from produccion_insumos pi join insumos i on i.id = pi.insumo_id
    where pi.produccion_id = p_produccion_id and i.tipo = 'tela';
  select count(*), coalesce(sum(pi.costo_total), 0) into v_n_avios, v_suma_avios
    from produccion_insumos pi join insumos i on i.id = pi.insumo_id
    where pi.produccion_id = p_produccion_id and i.tipo in ('avio', 'empaque');

  update producciones set
    costo_tela = case when v_n_tela > 0 then v_suma_tela else costo_tela end,
    costo_avios = case when v_n_avios > 0 then v_suma_avios else costo_avios end
  where id = p_produccion_id;
end;
$$;

grant execute on function retail.fn_aplicar_movimiento_insumo(uuid) to authenticated;
grant execute on function retail.recibir_insumos(uuid, jsonb, uuid, text) to authenticated;
grant execute on function retail.registrar_consumo_insumos(uuid, jsonb, text) to authenticated;
