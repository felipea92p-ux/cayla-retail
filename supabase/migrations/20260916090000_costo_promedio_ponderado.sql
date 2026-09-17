-- ============================================================================
-- 20260916090000_costo_promedio_ponderado.sql — CAYLA V2
--
-- D-45 (docs/datos/DECISIONES-2026-09-12.md:229-232) estaba abierta: Felipe no
-- sabía si hacía falta más detalle contable que "el costo nuevo pisa al
-- viejo". El 2026-09-16 decidió que sí: promedio ponderado, para compras Y
-- para cierres de producción del Taller por igual, con trazabilidad de qué
-- cambió el costo y por qué.
--
-- Qué hace:
--   1. `retail.costo_historial`: ledger append-only (mismo espíritu que
--      `movimientos`) con los 4 insumos de la fórmula por fila, para que
--      cualquier recálculo sea auditable a mano sin confiar ciegamente en el
--      sistema. Referencia el `movimientos.id` que lo causó — no duplica
--      columnas de referencia que `movimientos` ya resuelve (lote/compra/
--      producción): es la misma razón por la que `movimientos` no repite las
--      columnas de `compras`/`lotes` en vez de una FK.
--   2. `fn_recalcular_costo_variante(...)`: la única función que sabe calcular
--      el promedio ponderado. La llaman `recibir_lote`, `recibir_compras` y
--      `cerrar_produccion` — antes tenían la misma lógica de "pisar el
--      costo" copiada tres veces; ahora hay una sola fórmula.
--   3. `variantes.costo` también entra a `historial_producto_cambios`
--      (20260915204541) — se agrega una rama al trigger que ya existe para
--      categoría/precio, tal como ese archivo anticipó en su propio
--      comentario ("si mañana se quiere auditar otro campo, se agrega al
--      if/elsif a propósito"). Así el cambio de costo se ve gratis en
--      /productos/[id]/historial, sin pantalla nueva.
--
-- SE ROMPE SI: dos recepciones de la misma variante llegan en paralelo sin
-- lock — por eso fn_recalcular_costo_variante hace `select ... for update`
-- sobre `variantes` antes de leer costo/stock previos, serializando la
-- segunda detrás de la primera.
--
-- Solo LOCAL. No aplicar en producción sin autorización explícita de Felipe.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. El ledger de costo ----------

create table retail.costo_historial (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  stock_previo integer not null check (stock_previo >= 0),
  costo_anterior numeric(12,2) not null check (costo_anterior >= 0),
  cantidad_nueva integer not null check (cantidad_nueva > 0),
  costo_unitario_nuevo numeric(12,2) not null check (costo_unitario_nuevo >= 0),
  costo_resultante numeric(12,2) not null check (costo_resultante >= 0),
  origen text not null check (origen in ('compra', 'produccion')),
  movimiento_id uuid not null unique references retail.movimientos (id),
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now()
);

create index costo_historial_variante_idx on retail.costo_historial (variante_id, created_at desc);

alter table retail.costo_historial enable row level security;

create policy costo_historial_select on retail.costo_historial for select
  using (
    exists (
      select 1 from retail.movimientos m
      where m.id = costo_historial.movimiento_id
        and retail.fn_puede_operar_ubicacion(m.ubicacion_id)
    )
  );

revoke all on retail.costo_historial from authenticated, anon;
grant select on retail.costo_historial to authenticated;

-- Igual de inmutable que `movimientos` y que `historial_producto_cambios`: un
-- ledger no se edita ni se borra, ni siquiera por el dueño de una fila.
create function retail.fn_costo_historial_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'costo_historial es de solo lectura después de insertarse';
end;
$$;

create trigger costo_historial_sin_update
  before update or delete on retail.costo_historial
  for each row execute function retail.fn_costo_historial_inmutable();

comment on table retail.costo_historial is
  'Ledger append-only de cada recálculo de variantes.costo (promedio ponderado). variantes.costo es la caché del último costo_resultante, igual que stock es caché de movimientos.';

-- ---------- 2. La fórmula, en un solo lugar ----------

create function retail.fn_recalcular_costo_variante(
  p_variante_id uuid,
  p_cantidad_nueva integer,
  p_costo_unitario_nuevo numeric,
  p_origen text,
  p_movimiento_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_costo_anterior numeric;
  v_stock_previo integer;
  v_costo_resultante numeric;
  v_persona uuid;
begin
  if p_origen not in ('compra', 'produccion') then
    raise exception 'Origen de costo desconocido: %', p_origen;
  end if;
  if p_cantidad_nueva <= 0 then
    raise exception 'La cantidad que genera el nuevo costo debe ser mayor a cero';
  end if;
  if p_costo_unitario_nuevo < 0 then
    raise exception 'El costo unitario no puede ser negativo';
  end if;

  -- Bloquea la variante: dos recepciones/cierres concurrentes de la misma
  -- variante se serializan acá. variantes.id es el mutex natural — no hay una
  -- fila de "stock total" que bloquear, stock está partido por ubicación.
  select costo into v_costo_anterior from variantes where id = p_variante_id for update;
  if not found then
    raise exception 'La variante % no existe', p_variante_id;
  end if;

  -- Todas las ubicaciones: variantes.costo es un solo valor global, stock
  -- está indexado por (variante_id, ubicacion_id, sububicacion_id). Se lee
  -- DESPUÉS del lock de variantes y ANTES de que el llamador aplique el
  -- movimiento que está por sumar p_cantidad_nueva (el orden importa: esta
  -- función se llama ANTES de fn_aplicar_movimiento, nunca después).
  select coalesce(sum(cantidad), 0)::integer into v_stock_previo from stock where variante_id = p_variante_id;

  v_costo_resultante := case
    when v_stock_previo = 0 then p_costo_unitario_nuevo
    else round(
      ((v_stock_previo * v_costo_anterior) + (p_cantidad_nueva * p_costo_unitario_nuevo))
      / (v_stock_previo + p_cantidad_nueva),
      2
    )
  end;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into costo_historial (
    variante_id, stock_previo, costo_anterior, cantidad_nueva,
    costo_unitario_nuevo, costo_resultante, origen, movimiento_id, usuario_id
  ) values (
    p_variante_id, v_stock_previo, v_costo_anterior, p_cantidad_nueva,
    p_costo_unitario_nuevo, v_costo_resultante, p_origen, p_movimiento_id, v_persona
  );

  update variantes set costo = v_costo_resultante where id = p_variante_id;

  return v_costo_resultante;
end;
$$;

-- No es opcional: a diferencia de fn_aplicar_movimiento (repite un delta que
-- ya está en una fila real de movimientos), esta función acepta un costo
-- arbitrario sin chequear ubicación. Si quedara ejecutable directo, cualquier
-- colaborador autenticado podría destrozar el costo global de cualquier
-- variante desde la consola del navegador. recibir_lote/recibir_compras/
-- cerrar_produccion siguen pudiendo llamarla: son security definer, corren
-- con el privilegio del dueño — el revoke no las afecta.
-- OJO, dos fuentes de permiso distintas, hay que cerrar las dos (encontrado
-- probando — cada intento parcial dejó la función igual de llamable):
--   1. Postgres otorga EXECUTE a PUBLIC automáticamente al crear una función.
--   2. 0005_grants.sql tiene `alter default privileges in schema retail grant
--      execute on functions to authenticated` — esta función nace con
--      execute concedido a `authenticated` igual que cualquier otra, aparte
--      y además del punto 1.
-- Revocar solo de uno de los dos no alcanza; hace falta de ambos.
revoke all on function retail.fn_recalcular_costo_variante(uuid, integer, numeric, text, uuid) from public;
revoke execute on function retail.fn_recalcular_costo_variante(uuid, integer, numeric, text, uuid) from authenticated;

comment on function retail.fn_recalcular_costo_variante(uuid, integer, numeric, text, uuid) is
  'Recalcula variantes.costo como promedio ponderado y deja rastro en costo_historial. Llamar ANTES de fn_aplicar_movimiento (necesita el stock previo, sin la cantidad nueva todavía sumada).';

-- ---------- 3. Historial de producto: costo se suma a categoría/precio ----------
-- Mismo trigger de 20260915204541_historial_producto_cambios.sql, con una
-- rama nueva. Copiado completo (create or replace), tal como ese archivo
-- anticipó que se haría.

create or replace function retail.fn_registrar_cambio_producto()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from public.personas where auth_user_id = auth.uid();

  if TG_TABLE_NAME = 'productos' then
    if new.categoria_id is distinct from old.categoria_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'categoria_id', old.categoria_id::text, new.categoria_id::text, v_usuario_id);
    end if;
  elsif TG_TABLE_NAME = 'variantes' then
    if new.precio is distinct from old.precio then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'precio', old.precio::text, new.precio::text, v_usuario_id);
    end if;
    if new.costo is distinct from old.costo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'costo', old.costo::text, new.costo::text, v_usuario_id);
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 4. Lectura rica: qué operación exacta causó cada cambio ----------

create function retail.fn_costo_historial(p_variante_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  stock_previo integer,
  costo_anterior numeric,
  cantidad_nueva integer,
  costo_unitario_nuevo numeric,
  costo_resultante numeric,
  origen text,
  usuario_nombre text,
  lote_guia text,
  proveedor_nombre text,
  compra_documento text,
  produccion_referencia text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select
    ch.id, ch.created_at, ch.stock_previo, ch.costo_anterior, ch.cantidad_nueva,
    ch.costo_unitario_nuevo, ch.costo_resultante, ch.origen,
    per.nombres || ' ' || per.apellidos,
    lo.numero_guia, prov.nombre,
    nullif(trim(concat_ws(' ', cp.serie, cp.numero)), ''),
    prod_p.referencia
  from costo_historial ch
  join movimientos m on m.id = ch.movimiento_id
  left join public.personas per on per.id = ch.usuario_id
  left join lotes lo on lo.id = m.lote_id
  left join proveedores prov on prov.id = lo.proveedor_id
  left join compra_items ci on ci.id = m.compra_item_id
  left join compras cp on cp.id = ci.compra_id
  left join producciones prod on prod.id = m.produccion_id
  left join productos prod_p on prod_p.id = prod.producto_id
  where ch.variante_id = p_variante_id
  order by ch.created_at desc;
$$;

-- Sin fn_puede_operar_ubicacion a propósito: el costo ya es dato de catálogo
-- visible a cualquier colaborador de cualquier sede hoy (variantes_select no
-- tiene scope de ubicación) — pedirle a esta función más que a la tabla que
-- resume crearía una inconsistencia rara (ver el costo actual sin filtro,
-- pero no poder ver por qué cambió). La policy de costo_historial sí queda
-- scoped, como cinturón y tirantes para el acceso directo a la tabla.
revoke all on function retail.fn_costo_historial(uuid) from public;
grant execute on function retail.fn_costo_historial(uuid) to authenticated;

comment on function retail.fn_costo_historial(uuid) is
  'Detalle rico de cada recálculo de costo de una variante: con qué lote/factura/corrida de producción exacta. El cambio simple (de X a Y) ya se ve gratis en fn_historial_producto_cambios.';

-- ---------- 5. Las tres funciones que escriben variantes.costo ----------
-- Cuerpo completo copiado de su versión vigente (20260914230000 y
-- 20260915130000) — se cambia solo el tramo de costo y el orden respecto a
-- fn_aplicar_movimiento (el insert de movimientos no toca stock; solo
-- fn_aplicar_movimiento lo hace, así que fn_recalcular_costo_variante corre
-- ANTES de esa llamada, con el stock previo todavía sin la cantidad nueva).

create or replace function retail.recibir_lote(
  p_ubicacion_id uuid, p_proveedor_id uuid, p_items jsonb,
  p_numero_guia text default null, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_item jsonb; v_mov_id uuid; v_persona uuid; v_sub uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un lote necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, p_proveedor_id, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_persona)
      returning id into v_mov_id;

    if (v_item ->> 'costo_unitario') is not null then
      perform fn_recalcular_costo_variante(
        (v_item ->> 'variante_id')::uuid,
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric,
        'compra',
        v_mov_id
      );
    end if;

    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  return v_lote_id;
end;
$$;

create or replace function retail.recibir_compras(
  p_ubicacion_id uuid,
  p_items jsonb,                       -- [{compra_item_id, variante_id, cantidad}]
  p_numero_guia text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lote_id uuid; v_persona uuid; v_item jsonb; v_mov_id uuid; v_sub uuid;
  v_linea compra_items%rowtype; v_compra compras%rowtype;
  v_proveedor uuid; v_recibido integer; v_cantidad integer;
  v_agregado jsonb;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción necesita al menos un ítem';
  end if;

  for v_agregado in
    select jsonb_build_object('compra_item_id', i ->> 'compra_item_id', 'cantidad', sum((i ->> 'cantidad')::integer))
    from jsonb_array_elements(p_items) i
    group by i ->> 'compra_item_id'
  loop
    select * into v_linea from compra_items where id = (v_agregado ->> 'compra_item_id')::uuid for update;
    if not found then
      raise exception 'La línea de factura % no existe', v_agregado ->> 'compra_item_id';
    end if;
    select * into v_compra from compras where id = v_linea.compra_id;
    if v_compra.estado <> 'vigente' then
      raise exception 'La factura %-% está anulada', v_compra.serie, v_compra.numero;
    end if;
    if v_proveedor is null then
      v_proveedor := v_compra.proveedor_id;
    elsif v_proveedor <> v_compra.proveedor_id then
      raise exception 'Una recepción cubre facturas de un solo proveedor';
    end if;

    select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
    v_cantidad := (v_agregado ->> 'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad recibida debe ser mayor a cero';
    end if;
    if v_recibido + v_cantidad > v_linea.cantidad then
      raise exception 'Factura %-%: la línea tiene % facturados, % ya recibidos y se intenta recibir % más',
        v_compra.serie, v_compra.numero, v_linea.cantidad, v_recibido, v_cantidad;
    end if;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');

  insert into lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota)
    values (p_ubicacion_id, v_proveedor, p_numero_guia, v_persona, p_nota)
    returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_linea from compra_items where id = (v_item ->> 'compra_item_id')::uuid;

    if v_linea.variante_id is not null and v_linea.variante_id <> (v_item ->> 'variante_id')::uuid then
      raise exception 'La línea de factura ya especifica una variante distinta a la recibida';
    end if;
    if not exists (
      select 1 from variantes where id = (v_item ->> 'variante_id')::uuid and producto_id = v_linea.producto_id
    ) then
      raise exception 'La variante recibida no pertenece al producto de la línea de factura';
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'entrada',
              (v_item ->> 'cantidad')::integer, 'recepcion', v_lote_id, v_linea.id, v_persona)
      returning id into v_mov_id;

    perform fn_recalcular_costo_variante(
      (v_item ->> 'variante_id')::uuid,
      (v_item ->> 'cantidad')::integer,
      v_linea.costo_unitario,
      'compra',
      v_mov_id
    );

    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  return v_lote_id;
end;
$$;

create or replace function retail.cerrar_produccion(
  p_produccion_id uuid,
  p_buenas jsonb,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_costo_maquila numeric
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype; v_persona uuid; v_b jsonb; v_total integer := 0;
  v_linea produccion_lineas%rowtype; v_mov uuid; v_sub uuid; v_costo numeric;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  -- El candado del doble conteo: un segundo clic no vuelve a sumar las mismas prendas.
  if v_orden.estado <> 'en_proceso' or v_orden.inventariado_at is not null then
    raise exception 'Esta orden ya está cerrada';
  end if;
  if p_buenas is null or jsonb_array_length(p_buenas) = 0 then
    raise exception 'Indica cuántas salieron buenas de cada talla';
  end if;

  -- Las buenas se anotan línea por línea; una variante que no era de la orden se rechaza.
  for v_b in select * from jsonb_array_elements(p_buenas) loop
    if (v_b ->> 'cantidad')::integer is null or (v_b ->> 'cantidad')::integer < 0 then
      raise exception 'Las buenas de cada talla son cero o más';
    end if;
    update produccion_lineas set cantidad_buenas = (v_b ->> 'cantidad')::integer
      where produccion_id = p_produccion_id and variante_id = (v_b ->> 'variante_id')::uuid;
    if not found then
      raise exception 'Una de las tallas no pertenece a esta orden';
    end if;
  end loop;
  -- Línea que el formulario no mandó = ninguna buena. Así toda línea queda contestada.
  update produccion_lineas set cantidad_buenas = 0
    where produccion_id = p_produccion_id and cantidad_buenas is null;

  select coalesce(sum(cantidad_buenas), 0) into v_total from produccion_lineas where produccion_id = p_produccion_id;
  if v_total = 0 then
    raise exception 'No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla';
  end if;

  update producciones
    set cantidad_buenas = v_total,
        costo_tela = coalesce(p_costo_tela, costo_tela),
        costo_avios = coalesce(p_costo_avios, costo_avios),
        costo_maquila = coalesce(p_costo_maquila, costo_maquila),
        estado = 'terminada',
        inventariado_at = case when es_muestra then null else now() end
    where id = p_produccion_id;

  -- Una muestra se da por terminada y no toca el stock ni el costo de la prenda.
  if v_orden.es_muestra then return; end if;

  select costo_unitario into v_costo from producciones where id = p_produccion_id;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(v_orden.ubicacion_id, 'entrada');

  for v_linea in
    select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0
  loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, produccion_id, usuario_id)
      values (v_linea.variante_id, v_orden.ubicacion_id, v_sub, 'entrada', v_linea.cantidad_buenas, 'produccion', p_produccion_id, v_persona)
      returning id into v_mov;

    -- D-31 / D-45: el costo REAL de la corrida entra al promedio ponderado de
    -- la prenda (ya no lo pisa) — misma función que recibir_lote/recibir_compras.
    perform fn_recalcular_costo_variante(v_linea.variante_id, v_linea.cantidad_buenas, v_costo, 'produccion', v_mov);

    perform fn_aplicar_movimiento(v_mov);
  end loop;
end;
$$;
