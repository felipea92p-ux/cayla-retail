-- ============================================================================
-- 20261028153000_dueno_real_en_caja_historial_y_movimientos.sql — CAYLA V2 · ADR-0542 (reemplaza la regla por marca de ADR-0532)
--
-- QUÉ ES. Caja, el Historial de ventas y el filtro «Tienda» de Movimientos dejan de decidir de quién es lo vendido por la MARCA de la prenda
-- (ADR-0532: en Lima, marca CAYLA → CAYLA; todo lo demás → CLAURE) y pasan a leer el DUEÑO REAL de lo que se vendió: el que marcó la persona al
-- ingresar el stock y viajó hasta el movimiento de la venta (`movimientos.empresa_id`, migración 20261027222000). Felipe (2026-10-27): hay prendas
-- de CAYLA con proveedor y marca ajenos; «lo único que indica de quién es es el botón» de quien opera. De las ventas del 23 al 27-oct, S/ 317 de
-- S/ 435 «de CLAURE» eran prendas que el catálogo registra como CAYLA.
--
-- EL DUEÑO DE UNA LÍNEA (`fn_dueno_de_la_linea`): el dueño del movimiento de salida de esa línea de venta; si la venta es anterior al libro
-- (movimiento sin dueño), el de la FICHA de la prenda, que es lo que Felipe eligió para rehacer el historial («rehacer con la regla nueva»).
--
-- LO QUE CAMBIA (ninguna firma cambia, así que la web y los permisos siguen igual):
--   1. `fn_vendido_por_empresa` (Historial), `fn_vendido_por_empresa_de_cajas` (Caja) y `fn_empresa_de_ventas` (la marca «CLAURE» de cada
--      venta): se redefinen sobre `fn_dueno_de_la_linea`. Son funciones propias de ADR-0532 y sin parches encima.
--   2. `fn_movimientos` y `fn_movimientos_resumen_procesos` (el filtro «Tienda»): un reemplazo ANCLADO sobre `pg_get_functiondef`, con candado de
--      huella antes y después, igual que el de 20261026234000. Cada ancla es la línea marcada `ADR-0532: filtro_empresa` y aparece una sola vez;
--      un movimiento pasa si su dueño (el del movimiento; si no tiene, el de la ficha) es la empresa pedida.
--   3. Se retiran `fn_empresa_de_prenda_en_sede` y `fn_marcas_de_empresas` (la regla por marca): nadie las llama (`drop function` no toma
--      candados de `auth`). La columna `empresas.marca_id` queda sin uso (no se borra: es un dato).
--
-- LO QUE NO HACE. No parte el efectivo ni los pagos por empresa (decisión de ADR-0532). No toca etiquetas, ni el filtro «Tienda» de Catálogo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de 20261027222000 (necesita `movimientos.empresa_id`). Una sola parte, sin tablas tomadas, sin políticas ni
-- `drop trigger` (CLAUDE.md «Políticas y deadlocks»). Con otra huella «antes» en alguna de las dos funciones de Movimientos aborta sin tocar nada.
-- Idempotente. La última línea dice «QUEDÓ BIEN».
--
-- SE ROMPE SI. Una venta de antes del libro tiene un movimiento sin dueño y su prenda cambió de ficha después: se lee con la ficha de hoy.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El dueño de una línea vendida ----------------------------------------------------------------------------------------------
create or replace function retail.fn_dueno_de_la_linea(p_venta_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select m.empresa_id from retail.movimientos m
      where m.venta_item_id = p_venta_item_id and m.tipo = 'salida' and m.empresa_id is not null
      order by m.created_at limit 1),
    (select p.empresa_id from retail.venta_items i
       join retail.variantes va on va.id = i.variante_id
       join retail.productos p on p.id = va.producto_id
      where i.id = p_venta_item_id))
$$;

comment on function retail.fn_dueno_de_la_linea(uuid) is
  'ADR-0542: de qué empresa es una línea vendida: el dueño del movimiento de salida (el que marcó la persona), o la ficha de la prenda si la venta es anterior al libro.';

revoke all on function retail.fn_dueno_de_la_linea(uuid) from public, anon, authenticated;

-- 2. Historial: lo vendido por empresa con los filtros de la pantalla --------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_sede_id uuid default null,
  p_vendedor_id uuid default null,
  p_estado text default 'todas',
  p_pago text default null,
  p_comprobante text default 'todos',
  p_incluir_prueba boolean default false
)
returns table (empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- La misma regla de lectura que `fn_totales_historial_ventas` y la política `ventas_select`: el líder todas, cada quien su sede.
  v_lider boolean := coalesce(fn_es_lider(), false);
  v_ubicacion uuid := fn_ubicacion_actual_persona();
begin
  if p_estado not in ('todas', 'completada', 'anulada') then
    raise exception 'Estado de venta desconocido: %', p_estado using errcode = '22023';
  end if;
  if p_comprobante not in ('todos', 'con', 'sin') then
    raise exception 'Filtro de comprobante desconocido: %', p_comprobante using errcode = '22023';
  end if;

  -- Los filtros son copia de los de `fn_totales_historial_ventas`: si una cambia, cambia la otra (la prueba
  -- `pruebas:vendido-por-empresa` compara las dos sumas con los mismos filtros).
  return query
  with filtradas as (
    select v.id, v.ubicacion_id
    from ventas v
    where (v_lider or v.ubicacion_id = v_ubicacion)
      and v.estado <> 'anulada'
      and (p_desde is null or v.created_at >= p_desde)
      and (p_hasta is null or v.created_at < p_hasta)
      and (p_sede_id is null or v.ubicacion_id = p_sede_id)
      and (p_vendedor_id is null or v.asesora_id = p_vendedor_id or (v.asesora_id is null and v.usuario_id = p_vendedor_id))
      and (p_estado = 'todas' or v.estado = p_estado)
      and (p_incluir_prueba or not v.es_prueba)
      and (p_pago is null or exists (select 1 from venta_pagos vp where vp.venta_id = v.id and vp.metodo = p_pago))
      and (
        p_comprobante = 'todos'
        or exists (
          select 1 from comprobantes c
          where c.venta_id = v.id
            and c.tipo in ('boleta', 'factura', 'nota_venta')
            and (v_lider or c.ubicacion_id = v_ubicacion)
        ) = (p_comprobante = 'con')
      )
  ),
  lineas as (
    select i.venta_id, i.cantidad,
           coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2)) as monto,
           fn_dueno_de_la_linea(i.id) as empresa_id
    from venta_items i
    join filtradas f on f.id = i.venta_id
  )
  select e.id, e.clave, e.nombre, e.orden,
         count(distinct l.venta_id)::integer,
         sum(l.cantidad)::integer,
         round(sum(l.monto), 2)
  from lineas l
  join empresas e on e.id = l.empresa_id
  group by e.id, e.clave, e.nombre, e.orden
  order by e.orden, e.nombre;
end;
$$;

comment on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) is
  'ADR-0532/0542: cuánto de lo vendido es de cada empresa (CAYLA, CLAURE), prenda por prenda y según el dueño de cada línea (fn_dueno_de_la_linea, ADR-0542), con los mismos filtros y la misma regla de lectura que fn_totales_historial_ventas: su suma es el «vendido» del Historial. Sin anuladas. Solo lectura.';

-- 3. Caja: lo vendido por empresa en cada turno -------------------------------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa_de_cajas(p_cajas uuid[])
returns table (caja_id uuid, empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Lo vendido del turno es lo de `fn_resumen_caja`: todas las ventas de la caja menos las anuladas (las de prueba también, porque
  -- su dinero estuvo en el cajón). Solo las cajas que la cuenta puede ver (la regla de `cajas_select`); las demás no salen.
  with vistas as (
    select c.id
    from cajas c
    where c.id = any (p_cajas)
      and coalesce(fn_es_lider() or c.ubicacion_id = fn_ubicacion_actual_persona(), false)
  ),
  lineas as (
    select v.caja_id, i.venta_id, i.cantidad,
           coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2)) as monto,
           fn_dueno_de_la_linea(i.id) as empresa_id
    from ventas v
    join vistas cv on cv.id = v.caja_id
    join venta_items i on i.venta_id = v.id
    where v.estado <> 'anulada'
  )
  select l.caja_id, e.id, e.clave, e.nombre, e.orden,
         count(distinct l.venta_id)::integer,
         sum(l.cantidad)::integer,
         round(sum(l.monto), 2)
  from lineas l
  join empresas e on e.id = l.empresa_id
  group by l.caja_id, e.id, e.clave, e.nombre, e.orden
  order by l.caja_id, e.orden, e.nombre
$$;

comment on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) is
  'ADR-0532/0542: cuánto de lo vendido en cada turno de caja es de cada empresa (CAYLA, CLAURE), línea por línea (fn_dueno_de_la_linea, ADR-0542), con la regla de fn_resumen_caja (sin anuladas). Solo las cajas que la cuenta puede ver. Solo lectura.';

-- 4. Cada venta: cuánto es de cada empresa ------------------------------------------------------------------------------------
create or replace function retail.fn_empresa_de_ventas(p_ventas uuid[])
returns table (venta_id uuid, empresa_id uuid, monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Para la marca «CLAURE» de cada venta en la lista del Historial. La regla de lectura de `ventas_select`: el líder todas, cada quien
  -- las de su sede; las demás no salen. Se pide por página (a lo sumo unas decenas de ids).
  select i.venta_id,
         fn_dueno_de_la_linea(i.id),
         round(sum(coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2))), 2)
  from ventas v
  join venta_items i on i.venta_id = v.id
  where v.id = any (p_ventas)
    and coalesce(fn_es_lider() or v.ubicacion_id = fn_ubicacion_actual_persona(), false)
  group by 1, 2
$$;

comment on function retail.fn_empresa_de_ventas(uuid[]) is
  'ADR-0532/0542: cuánto de cada venta es de cada empresa (fn_dueno_de_la_linea, ADR-0542), para marcarla en el Historial. Solo las ventas que la cuenta puede ver. Solo lectura.';


-- 3. Movimientos: el filtro «Tienda» por el dueño del movimiento ------------------------------------------------------------------
create or replace function pg_temp.dueno_md5(p_firma text)
returns text
language sql
as $f$
  select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
    from pg_proc p where p.oid = to_regprocedure(p_firma)
$f$;

-- Reemplaza `p_ancla` por `p_nuevo` si y solo si aparece exactamente una vez.
create or replace function pg_temp.dueno_reemplazar(p_texto text, p_ancla text, p_nuevo text)
returns text
language plpgsql
as $f$
begin
  if (length(p_texto) - length(replace(p_texto, p_ancla, ''))) / length(p_ancla) <> 1 then
    raise exception 'dueño real en Movimientos: la marca «%» no aparece exactamente una vez en la función. No se toca nada.', left(p_ancla, 70);
  end if;
  return replace(p_texto, p_ancla, p_nuevo);
end
$f$;

do $migracion$
declare
  c_lista constant text := 'retail.fn_movimientos(uuid,date,date,text,text,text,uuid,uuid,timestamp with time zone,uuid,integer,uuid,uuid)';
  c_lista_antes constant text := '4aac753eee6f7081649f2182ba32c1e1';
  c_lista_despues constant text := '39c8df0d92df32ab9924fd7668dff99d';
  c_resumen constant text := 'retail.fn_movimientos_resumen_procesos(uuid,date,date,text,text,uuid,uuid,uuid)';
  c_resumen_antes constant text := '99ac6aac24a4ef1a65d10c52a6c1e777';
  c_resumen_despues constant text := '1ac9034987a61033038fa3db72d50a8c';
  v_md5 text;
  v_def text;
begin
  -- ---------- fn_movimientos: la lista ----------
  v_md5 := pg_temp.dueno_md5(c_lista);
  if v_md5 is null then
    raise exception '% no existe en esta base (falta 20261026234000).', c_lista;
  elsif v_md5 = c_lista_despues then
    raise notice 'fn_movimientos ya filtra por el dueño real: no se toca.';
  elsif v_md5 <> c_lista_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba %). Lee su definición viva y rehace este parche sobre ESA versión.', c_lista, v_md5, c_lista_antes;
  else
    v_def := pg_get_functiondef(c_lista::regprocedure);
    v_def := pg_temp.dueno_reemplazar(v_def,
      $a$and (p_empresa_id is null or fn_empresa_de_prenda_en_sede(va.producto_id, p_ubicacion_id) = p_empresa_id) /* ADR-0532: filtro_empresa */$a$,
      $n$and (p_empresa_id is null or coalesce(m.empresa_id, (select pr.empresa_id from productos pr where pr.id = va.producto_id)) = p_empresa_id) /* ADR-0542: filtro_dueno */$n$);
    execute v_def;
    v_md5 := pg_temp.dueno_md5(c_lista);
    if v_md5 <> c_lista_despues then
      raise exception 'dueño real en Movimientos: fn_movimientos quedó con md5 % y se esperaba %.', v_md5, c_lista_despues;
    end if;
  end if;

  -- ---------- fn_movimientos_resumen_procesos: las cifras ----------
  v_md5 := pg_temp.dueno_md5(c_resumen);
  if v_md5 is null then
    raise exception '% no existe en esta base (falta 20261026234000).', c_resumen;
  elsif v_md5 = c_resumen_despues then
    raise notice 'fn_movimientos_resumen_procesos ya filtra por el dueño real: no se toca.';
  elsif v_md5 <> c_resumen_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba %). Lee su definición viva y rehace este parche sobre ESA versión.', c_resumen, v_md5, c_resumen_antes;
  else
    v_def := pg_get_functiondef(c_resumen::regprocedure);
    v_def := pg_temp.dueno_reemplazar(v_def,
      $a$and (p_empresa_id is null or fn_empresa_de_prenda_en_sede((select va.producto_id from variantes va where va.id = m.variante_id), p_ubicacion_id) = p_empresa_id) /* ADR-0532: filtro_empresa */$a$,
      $n$and (p_empresa_id is null or coalesce(m.empresa_id, (select pr.empresa_id from productos pr join variantes va on va.id = m.variante_id where pr.id = va.producto_id)) = p_empresa_id) /* ADR-0542: filtro_dueno */$n$);
    execute v_def;
    v_md5 := pg_temp.dueno_md5(c_resumen);
    if v_md5 <> c_resumen_despues then
      raise exception 'dueño real en Movimientos: fn_movimientos_resumen_procesos quedó con md5 % y se esperaba %.', v_md5, c_resumen_despues;
    end if;
  end if;
end
$migracion$;

-- 4. Se retira la regla por marca ---------------------------------------------------------------------------------------------------
-- Ya nadie la llama: ni las lecturas de arriba ni la web (que dejó de pedir la marca de las empresas). `drop function` no toma candados de `auth`.
drop function if exists retail.fn_empresa_de_prenda_en_sede(uuid, uuid);
drop function if exists retail.fn_marcas_de_empresas();
comment on column retail.empresas.marca_id is
  'SIN USO desde ADR-0542 (la marca ya no decide de quién es una prenda; lo marca la persona que opera). Se conserva el dato.';

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado: es seguro volver a pegarlo completo.
select '20261028153000 · el dueño real en Caja, Historial y Movimientos' as parte,
       case when to_regprocedure('retail.fn_dueno_de_la_linea(uuid)') is not null
             and to_regprocedure('retail.fn_empresa_de_prenda_en_sede(uuid,uuid)') is null
             and pg_get_functiondef('retail.fn_movimientos(uuid,date,date,text,text,text,uuid,uuid,timestamp with time zone,uuid,integer,uuid,uuid)'::regprocedure) like '%ADR-0542: filtro_dueno%'
             and pg_get_functiondef('retail.fn_movimientos_resumen_procesos(uuid,date,date,text,text,uuid,uuid,uuid)'::regprocedure) like '%ADR-0542: filtro_dueno%'
             and not has_function_privilege('anon', 'retail.fn_vendido_por_empresa_de_cajas(uuid[])', 'execute')
            then 'QUEDÓ BIEN' else 'REVISAR: falta una función, o el filtro de Movimientos no quedó parchado' end as resultado;
