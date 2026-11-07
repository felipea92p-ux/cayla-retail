-- 20261107171000 — Rendimiento (ADR-0622, parte 2): siete lecturas de tienda e inventario, con la misma respuesta
--
-- QUÉ ARREGLA. Siete lecturas lentas medidas sobre `cayla_carga` (copia de main + un año sintético: 6 tiendas, 24.000 tallas,
-- 144.000 filas de stock, 131.000 ventas, 263.000 líneas, 407.000 movimientos, 20.000 clientes). Ninguna cambia lo que
-- devuelve: cada una se comparó con md5 de su salida, antes y después, como líder y como integrante de tienda, y las de
-- CLAURE y devoluciones además con datos de prueba que ejercen esas ramas (dentro de begin … rollback).
--
-- LA CAUSA, EN UNA LÍNEA POR FUNCIÓN (detalle en el comentario de cada una):
--   fn_existencias_productos   una subconsulta por producto re-agrupaba TODO el stock: 505 s → ~1 s con los 3.000 productos.
--   fn_vendido_por_empresa     `fn_dueno_de_la_linea` una (o dos) veces por línea: 18 s → 1,4 s sin fechas; 2,7 s → 0,2 s en 30 días.
--   fn_club_compras_netas      dos funciones por fila sobre todas las ventas con cliente: Clientes 2,1 + 2,2 s → 0,33 + 0,33 s.
--   fn_observatorio            `fn_item_es_de_claure` copiada tres veces por línea: 3,8–4,3 s → 0,7–1,1 s.
--   fn_calidad                 CLAURE y origen del producto por línea: 1,9–2,6 s → 0,56 s.
--   fn_stock_por_sede_json     dos objetos jsonb por fila al quitar `ordinality`: ~1,0 s → ~0,85 s (lo de fondo es de diseño).
--
-- CÓMO PEGARLA EN PRODUCCIÓN (CLAUDE.md «Cómo aplicar SQL a producción»): todo lleva el prefijo `retail.` o corre dentro de
-- funciones con su `search_path`. No hay políticas ni `drop trigger`, así que no toma auth/storage (ADR-0195). Va en DOS
-- PARTES: la 1 son solo `create or replace function` (misma firma, mismas columnas: los permisos se conservan); la 2 es un
-- índice sobre `movimientos`, que toma un candado de escritura mientras se arma: pegarla aparte y en hora tranquila.
-- Se puede pegar dos veces.

-- ============================== CANDADO (corre primero, en la PARTE 1) ==============================
-- Cada función de abajo se reescribe ENTERA desde su cuerpo de main (medido en la copia `cayla_carga`). Si en la base el cuerpo
-- vivo es otro (alguien la parchó en vivo o una migración de otra rama la tocó después), pegar esto pisaría ese cambio: el
-- candado aborta todo (el SQL Editor corre todo en una transacción) y dice cuál. Acepta el cuerpo de main y el de este archivo,
-- así que se puede pegar dos veces. Si salta: reescribir esa función desde su `pg_get_functiondef` real antes de pegar.
do $candado$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_calidad(date,integer,integer)', '58857790112c93f73ed7c2ff280bfc24', 'e4d0686293d369fc692398e820f37db3'),
    ('retail.fn_club_compras_netas(uuid)', 'f949067dd10fa651265aabf511d268e6', '7f8e37a14b86b8028a8f499363f81904'),
    ('retail.fn_existencias_productos(uuid[],uuid)', '2711e8313a93f61bada5175c6a1c97ea', '3871e8811c16d3ddbb6b9243a1fe1249'),
    ('retail.fn_observatorio(integer)', '5b9868f45de70d6df4b0784ab2dffc0b', '4012ef5a902c17cf98a5385dcdf7113a'),
    ('retail.fn_stock_por_sede_json()', '081f4e4185539050b0c20e31cb4644ac', '43a6ac607fdb9bb44d840e5cfaff77e3'),
    ('retail.fn_vendido_por_empresa(timestamp with time zone,timestamp with time zone,uuid,uuid,text,text,text,boolean)', '760ec6cf0c045218bb219a6ed0d87eba', 'b45c51bc17b321cd9bb6430ab056d657')
  ) as t(firma, md5_main, md5_nuevo) loop
    select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      raise exception 'Falta %: esta migración no la crea, solo la reescribe.', r.firma;
    end if;
    if v_md5 not in (r.md5_main, r.md5_nuevo) then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma, v_md5;
    end if;
  end loop;
end
$candado$;

-- ============================== PARTE 1 · funciones ==============================
set lock_timeout = '3s';


create or replace function retail.fn_stock_por_sede_json()
 returns jsonb
 language sql
 stable
 set search_path to 'retail', 'public', 'extensions'
as $function$
  -- Auditoría de rendimiento 2026-11-07: `jsonb_build_object` con las tres columnas en vez de `to_jsonb(r) - 'ordinality'`.
  -- `to_jsonb(r)` arma un objeto de CUATRO claves por fila (con `ordinality`) y el `-` lo vuelve a copiar entero para
  -- quitarla: dos objetos por fila. Con 144.000 filas (6 sedes × 24.000 tallas) eran ~860 ms solo en armar el JSON;
  -- así, ~600 ms. Mismo orden (`ordinality`), mismas claves, mismo texto: jsonb ordena las claves igual.
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', r.variante_id,
                                               'ubicacion_id', r.ubicacion_id,
                                               'cantidad', r.cantidad)
                            order by r.ordinality), '[]'::jsonb)
  from retail.fn_stock_por_sede() with ordinality r;
$function$;

create or replace function retail.fn_observatorio(p_dias integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_ahora timestamp := now() at time zone 'America/Lima';
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_dias integer := greatest(8, least(coalesce(p_dias, 60), 120));
  v_ini timestamptz;
  v_res jsonb;
begin
  if not retail.fn_es_admin() then
    raise exception 'El Observatorio es solo de las cuentas Admin.' using errcode = '42501';
  end if;
  -- Desde la medianoche de Lima del primer día de la ventana (que siempre incluye el mismo día de la semana pasada).
  v_ini := (v_hoy - (v_dias - 1))::timestamp at time zone 'America/Lima';

  with tiendas as materialized (
    select u.id, u.nombre, u.hora_cierre
    from retail.ubicaciones u
    where u.tipo = 'tienda' and u.activo
  ),
  -- La condición de la primera rama de `fn_item_es_de_claure` (ADR-0583), leída una sola vez.
  claure_sedes as materialized (
    select es.ubicacion_id, e.cuenta_corriente_desde as desde
    from retail.empresas e
    join retail.empresa_sedes es on es.empresa_id = e.id
    where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
  ),
  v as materialized (
    select ve.id,
           ve.ubicacion_id as u,
           ve.created_at at time zone 'America/Lima' as lima,
           coalesce(ve.asesora_id, ve.usuario_id) as quien,
           coalesce(sum(vi.subtotal) filter (where not o.es), 0) as s,
           coalesce(sum(vi.cantidad) filter (where not o.es), 0) as p
    from retail.ventas ve
    join tiendas t on t.id = ve.ubicacion_id
    left join retail.venta_items vi on vi.venta_id = ve.id
    -- ADR-0560 (6a): lo vendido de CLAURE no es de CAYLA.
    -- Auditoría de rendimiento 2026-11-07: UNA llamada por línea, y solo donde puede responder «sí».
    -- (1) `offset 0`: sin él, Postgres aplana el lateral y copia `fn_item_es_de_claure(...)` a cada lugar donde se usa
    --     `o.es` (los dos `filter` y el `bool_or`): tres llamadas por línea, ~127.000 en 60 días del año sintético.
    -- (2) La primera rama de `fn_item_es_de_claure` (ADR-0583) responde «no» sin mirar la línea si la sede no es de
    --     CLAURE o la venta es de antes de su arranque. Esa misma condición se pregunta aquí una vez por venta contra
    --     `claure_sedes` (una o dos filas); solo si pasa se llama a la función, que repite la pregunta y busca el dueño.
    --     Así la respuesta sigue siendo la de la función: lo de aquí solo evita llamarla cuando su respuesta ya es «no».
    cross join lateral (
      select case
               when not exists (select 1 from claure_sedes cs
                                 where cs.ubicacion_id = ve.ubicacion_id
                                   and (ve.created_at at time zone 'America/Lima')::date >= cs.desde) then false
               else retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
             end as es
      offset 0) o
    where ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
    group by ve.id
    having bool_or(not o.es)
  ),
  dias as (
    select (v_hoy - g)::date as f from generate_series(0, v_dias - 1) g
  ),
  por_dia as (
    select v.u, v.lima::date as f, sum(v.s) as s, count(*) as t, sum(v.p) as p
    from v
    group by 1, 2
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'ahora_min', extract(hour from v_ahora)::int * 60 + extract(minute from v_ahora)::int,
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', t.nombre,
               'cierre', to_char(t.hora_cierre, 'HH24:MI'),
               'caja', (
                 select jsonb_build_object(
                          'desde', extract(hour from c.abierta_en at time zone 'America/Lima')::int * 60
                                   + extract(minute from c.abierta_en at time zone 'America/Lima')::int,
                          'por', coalesce(pc.nombres, ''))
                 from retail.cajas c
                 left join public.personas pc on pc.id = c.abierta_por
                 where c.ubicacion_id = t.id and c.estado = 'abierta' and not coalesce(c.es_prueba, false)
                 order by c.abierta_en desc
                 limit 1),
               'turno', retail.fn_observatorio_turno(t.id)
             ) order by t.nombre)
      from tiendas t), '[]'::jsonb),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', t.id, 'f', d.f,
               's', coalesce(x.s, 0), 't', coalesce(x.t, 0), 'p', coalesce(x.p, 0),
               'm', (select pc.meta from retail.fn_parametros_caja(t.id, d.f) pc)
             ) order by d.f, t.nombre)
      from tiendas t
      cross join dias d
      left join por_dia x on x.u = t.id and x.f = d.f), '[]'::jsonb),
    'hoy_ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s, 'p', v.p,
               'q', coalesce(nullif(trim(coalesce(pe.nombres, '') || ' ' || coalesce(split_part(pe.apellidos, ' ', 1), '')), ''), '—')
             ) order by v.lima)
      from v
      left join public.personas pe on pe.id = v.quien
      where v.lima::date = v_hoy), '[]'::jsonb),
    'semana_pasada', coalesce((
      select jsonb_agg(jsonb_build_object(
               'u', v.u,
               'min', extract(hour from v.lima)::int * 60 + extract(minute from v.lima)::int,
               's', v.s
             ) order by v.lima)
      from v
      where v.lima::date = v_hoy - 7), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end;
$function$

;

create or replace function retail.fn_existencias_productos(p_producto_ids uuid[], p_ubicacion_id uuid)
 returns table(producto_id uuid, aqui integer, apartado_aqui integer, danado_aqui integer, en_camino_aqui integer, en_otras_tiendas integer, en_taller integer, otras jsonb, en_tallas_retiradas integer)
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  -- Una fila por producto con algo que contar (sin filas: nunca tuvo stock → la pantalla muestra 0).
  --   aqui / apartado_aqui / danado_aqui / en_camino_aqui   la sede elegida arriba (ADR-0270, decisiones 1, 2, 3 y 5)
  --   en_otras_tiendas + otras                             el resto de tiendas activas, sede por sede («+60 en Lima»)
  --   en_taller                                            aparte, nunca sumado a lo que se vende (decisión 4)
  --   en_tallas_retiradas                                  unidades físicas en tallas desactivadas, en toda la red:
  --                                                         no se venden, así que no suman arriba; se muestran como aviso
  -- Auditoría de rendimiento 2026-11-07: `otras` se arma UNA vez para todos los productos (`otras_por_producto`) y se
  -- junta por producto. Antes era una subconsulta por producto que volvía a agrupar TODO `e` (otras_sedes se copiaba
  -- dentro de la subconsulta): con los 3.000 productos, 3.000 pasadas por 144.000 filas, más de 15 s. Mismas cifras.
  with e as materialized (
    select x.*, u.nombre, u.tipo
    from fn_existencias_base(null, p_producto_ids) x
    join ubicaciones u on u.id = x.ubicacion_id and u.activo
    where fn_tiene_acceso_retail()
  ),
  otras_sedes as (
    select e.producto_id, e.ubicacion_id, e.nombre, sum(e.disponible)::integer as disponible
    from e
    where not e.talla_retirada and e.tipo <> 'taller' and e.ubicacion_id is distinct from p_ubicacion_id
    group by e.producto_id, e.ubicacion_id, e.nombre
    having sum(e.disponible) > 0
  ),
  otras_por_producto as (
    select o.producto_id,
           jsonb_agg(jsonb_build_object('ubicacion_id', o.ubicacion_id, 'sede', o.nombre, 'disponible', o.disponible)
                     order by o.disponible desc, o.nombre) as otras
    from otras_sedes o
    group by o.producto_id
  ),
  sumas as (
    select e.producto_id,
           coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer as aqui,
           coalesce(sum(e.apartado)   filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer as apartado_aqui,
           coalesce(sum(e.danado)     filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer as danado_aqui,
           coalesce(sum(e.en_camino)  filter (where not e.talla_retirada and e.ubicacion_id = p_ubicacion_id), 0)::integer as en_camino_aqui,
           coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.tipo <> 'taller'
                                                and e.ubicacion_id is distinct from p_ubicacion_id), 0)::integer as en_otras_tiendas,
           coalesce(sum(e.disponible) filter (where not e.talla_retirada and e.tipo = 'taller'
                                                and e.ubicacion_id is distinct from p_ubicacion_id), 0)::integer as en_taller,
           coalesce(sum(e.fisico) filter (where e.talla_retirada), 0)::integer as en_tallas_retiradas
    from e
    group by e.producto_id
  )
  select s.producto_id, s.aqui, s.apartado_aqui, s.danado_aqui, s.en_camino_aqui, s.en_otras_tiendas, s.en_taller,
         coalesce(o.otras, '[]'::jsonb), s.en_tallas_retiradas
  from sumas s
  left join otras_por_producto o on o.producto_id = s.producto_id;
$function$;

create or replace function retail.fn_vendido_por_empresa(p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sede_id uuid DEFAULT NULL::uuid, p_vendedor_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT 'todas'::text, p_pago text DEFAULT NULL::text, p_comprobante text DEFAULT 'todos'::text, p_incluir_prueba boolean DEFAULT false)
 RETURNS TABLE(empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
  -- Auditoría de rendimiento 2026-11-07: el dueño de cada línea se pregunta en la misma consulta, con la regla de
  -- `fn_dueno_de_la_linea` (ADR-0560) escrita aquí, en vez de llamar a esa función una vez por línea. Cada llamada a una
  -- función `security definer` con `set search_path` cuesta un cambio de rol y de ajustes (en producción ~100x lo de la
  -- consulta misma, ver 20261101004000); con 30 días eran ~21.000 llamadas y ~2,7 s, y sin fechas pasaba de 15 s.
  -- La regla, idéntica: el `empresa_id` de su primera salida en `movimientos`; si no hay, el del producto vendido.
  -- Si `fn_dueno_de_la_linea` cambia, cambia esto (la prueba `pruebas:vendido-por-empresa` compara con ella).
  -- `materialized`: sin él, Postgres empuja el `join empresas` dentro y pregunta el dueño una vez por empresa (dos por línea).
  lineas as materialized (
    select i.venta_id, i.cantidad,
           coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2)) as monto,
           coalesce(
             (select m.empresa_id from movimientos m
               where m.venta_item_id = i.id and m.tipo = 'salida' and m.empresa_id is not null
               order by m.created_at limit 1),
             pr.empresa_id) as empresa_id
    from venta_items i
    join filtradas f on f.id = i.venta_id
    left join variantes va on va.id = i.variante_id
    left join productos pr on pr.id = va.producto_id
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
$function$

;

create or replace function retail.fn_club_compras_netas(p_clienta_id uuid default null::uuid)
 returns table(clienta_id uuid, venta_id uuid, ubicacion_id uuid, fecha timestamp with time zone)
 language sql
 stable
 set search_path to 'retail', 'public', 'extensions'
as $function$
  -- Auditoría de rendimiento 2026-11-07: mismas compras, menos llamadas por fila. Esta función alimenta la lista y las cifras
  -- de Clientes (`fn_club_resumen_compras`) y, sin cliente, recorre TODAS las ventas con cliente: con el año sintético
  -- (39.000 ventas, 79.000 líneas) eran ~2,5 s, casi todo en dos funciones llamadas por fila. Cada guarda de abajo solo
  -- evita llamar a una función cuando su respuesta ya se sabe; cuando no se sabe, se la llama igual que antes.
  --   · `fn_venta_devuelta_entera` solo puede decir «sí» si alguna línea tiene una devolución aprobada (la cantidad de una
  --     línea es > 0: `venta_items_cantidad_check`). Sin ninguna, la venta no está devuelta entera.
  --   · `fn_item_es_de_claure` dice «no» sin mirar la línea si la sede no es de CLAURE o la venta es de antes de su
  --     arranque (su primera rama, ADR-0583): entonces ninguna línea es de CLAURE y la compra cuenta.
  with claure_sedes as materialized (
    select es.ubicacion_id, e.cuenta_corriente_desde as desde
      from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id
     where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
  )
  select v.cliente_id, v.id, v.ubicacion_id, v.created_at
    from retail.ventas v
   where v.cliente_id is not null
     and (p_clienta_id is null or v.cliente_id = p_clienta_id)
     and v.estado = 'completada'
     and not v.es_prueba
     and case when exists (select 1
                             from retail.venta_items vi
                             join retail.devolucion_items di on di.venta_item_id = vi.id
                             join retail.devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
                            where vi.venta_id = v.id)
              then not retail.fn_venta_devuelta_entera(v.id)
              else true
         end
     -- ADR-0560 (6c): una compra solo de CLAURE no es compra de CAYLA (la mixta sí).
     and case when not exists (select 1 from claure_sedes cs
                                where cs.ubicacion_id = v.ubicacion_id
                                  and (v.created_at at time zone 'America/Lima')::date >= cs.desde)
              then true
              else (not exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
                    or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)))
         end;
$function$;

create or replace function retail.fn_calidad(p_dia date DEFAULT NULL::date, p_dias integer DEFAULT 90, p_plazo_dias integer DEFAULT 15)
 RETURNS TABLE(nivel text, clave text, etiqueta text, unidades_vendidas integer, unidades_devueltas integer, devueltas_vendibles integer, devueltas_danadas integer, devueltas_a_proveedor integer, unidades_cambiadas integer, cohorte_desde date, cohorte_hasta date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_dia date;
  v_hasta date;
  v_desde date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la calidad de las ventas';
  end if;
  if p_dias < 1 or p_plazo_dias < 0 then
    raise exception 'Parámetros fuera de rango (p_dias >= 1, p_plazo_dias >= 0)';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  -- Primer día que YA NO entra (exclusivo): las ventas de ese día aún no cumplieron su plazo completo.
  v_hasta := v_dia - p_plazo_dias;
  v_desde := v_hasta - p_dias;
  v_ts_desde := v_desde::timestamp at time zone 'America/Lima';
  v_ts_hasta := v_hasta::timestamp at time zone 'America/Lima';

  return query
  -- Auditoría de rendimiento 2026-11-07: las mismas líneas, con menos llamadas por fila (90 días del año sintético:
  -- ~65.000 líneas y ~2 s, casi todo en dos funciones `security definer` llamadas una vez por línea).
  --   · `fn_item_es_de_claure` dice «no» sin mirar la línea si la sede no es de CLAURE o la venta es de antes de su
  --     arranque (su primera rama, ADR-0583): esa condición se pregunta aquí contra `claure_sedes`, y solo si pasa se
  --     llama a la función. `offset 0` deja una sola llamada por línea.
  --   · El origen (`fn_origen_producto`) se arma en conjunto: ver `ingresos` y `origenes`.
  with claure_sedes as materialized (
    select es.ubicacion_id, e.cuenta_corriente_desde as desde
    from retail.empresas e
    join retail.empresa_sedes es on es.empresa_id = e.id
    where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
  ),
  lineas as materialized (
    select vi.id as item_id, vi.cantidad, va.producto_id, ta.valor as talla, p.categoria_id,
           (ve.created_at at time zone 'America/Lima')::date as dia
    from ventas ve
    join venta_items vi on vi.venta_id = ve.id
    join variantes va on va.id = vi.variante_id
    join productos p on p.id = va.producto_id
    left join tallas ta on ta.id = va.talla_id
    cross join lateral (
      select case
               when not exists (select 1 from claure_sedes cs
                                 where cs.ubicacion_id = ve.ubicacion_id
                                   and (ve.created_at at time zone 'America/Lima')::date >= cs.desde) then false
               else retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
             end as es
      offset 0) cl
    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
      -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA (no viene de su producción).
      and not cl.es
  ),
  -- El origen de cada (producto, día): la regla de `fn_origen_producto` escrita en conjunto, para no llamarla ~59.000
  -- veces (una por par distinto en 90 días). Mismo criterio: el ingreso más reciente hasta ese día —una compra vigente
  -- (por su fecha de emisión) o una producción terminada del Taller, sin muestras (por el día en que se inventarió)—,
  -- con el mismo desempate (fecha desc, tipo, origen_id). Si `fn_origen_producto` cambia, cambia esto.
  ingresos as materialized (
    select ci.producto_id, 'proveedor'::text as tipo, c.proveedor_id as origen_id, c.fecha_emision as fecha
    from compra_items ci
    join compras c on c.id = ci.compra_id
    where c.estado = 'vigente'
      and ci.producto_id in (select l.producto_id from lineas l)
    union all
    select pr.producto_id, 'taller'::text, null::uuid, (pr.inventariado_at at time zone 'America/Lima')::date
    from producciones pr
    where pr.estado = 'terminada'
      and not pr.es_muestra
      and pr.inventariado_at is not null
      and pr.producto_id in (select l.producto_id from lineas l)
  ),
  origenes as materialized (
    select d.producto_id, d.dia, o.tipo as origen_tipo, o.origen_id
    from (select distinct l.producto_id, l.dia from lineas l) d
    left join lateral (
      select g.tipo, g.origen_id
      from ingresos g
      where g.producto_id = d.producto_id and g.fecha <= d.dia
      order by g.fecha desc, g.tipo, g.origen_id
      limit 1
    ) o on true
  ),
  items as (
    select l.item_id, l.cantidad, l.producto_id, l.talla, l.categoria_id, og.origen_tipo, og.origen_id
    from lineas l
    join origenes og on og.producto_id = l.producto_id and og.dia = l.dia
  ),
  devuelto as (
    -- Una fila por línea de venta: cuánto volvió y en qué condición. Solo devoluciones APROBADAS.
    select di.venta_item_id,
           sum(di.cantidad) filter (where di.condicion = 'vendible') as vendibles,
           sum(di.cantidad) filter (where di.condicion in ('danada_reparacion', 'danada_donar')) as danadas,
           sum(di.cantidad) filter (where di.condicion = 'devolver_proveedor') as a_proveedor
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
    group by di.venta_item_id
  ),
  cambiado as (
    select c.venta_item_id, sum(c.cantidad) as cantidad
    from cambios c
    group by c.venta_item_id
  ),
  base as (
    select it.item_id, it.cantidad, it.producto_id, it.talla, it.categoria_id, it.origen_tipo, it.origen_id,
           coalesce(dv.vendibles, 0) as vendibles,
           coalesce(dv.danadas, 0) as danadas,
           coalesce(dv.a_proveedor, 0) as a_proveedor,
           coalesce(cb.cantidad, 0) as cambiadas
    from items it
    left join devuelto dv on dv.venta_item_id = it.item_id
    left join cambiado cb on cb.venta_item_id = it.item_id
  )
  select
    case when grouping(b.producto_id) = 0 then 'producto'
         when grouping(b.talla) = 0 then 'talla'
         when grouping(b.origen_tipo) = 0 then 'origen'
         when grouping(b.categoria_id) = 0 then 'categoria'
         else 'total' end,
    case when grouping(b.producto_id) = 0 then b.producto_id::text
         when grouping(b.talla) = 0 then coalesce(b.talla, '')
         when grouping(b.origen_tipo) = 0 then coalesce(b.origen_tipo, 'sin') || ':' || coalesce(b.origen_id::text, '')
         when grouping(b.categoria_id) = 0 then coalesce(b.categoria_id::text, '')
         else '' end,
    case when grouping(b.producto_id) = 0 then (select pr.referencia from productos pr where pr.id = b.producto_id)
         when grouping(b.talla) = 0 then coalesce(b.talla, 'Sin talla')
         when grouping(b.origen_tipo) = 0 then
           case b.origen_tipo
             when 'proveedor' then coalesce((select pv.nombre from proveedores pv where pv.id = b.origen_id), 'Proveedor sin nombre')
             when 'taller' then 'Taller'
             else 'Sin origen registrado' end
         when grouping(b.categoria_id) = 0 then coalesce((select ca.nombre from categorias ca where ca.id = b.categoria_id), 'Sin categoría')
         else 'Total' end,
    -- coalesce: sobre CERO filas, el total `()` sigue devolviendo una fila y un SUM de nada es NULL, no 0.
    coalesce(sum(b.cantidad), 0)::integer,
    coalesce(sum(b.vendibles + b.danadas + b.a_proveedor), 0)::integer,
    coalesce(sum(b.vendibles), 0)::integer,
    coalesce(sum(b.danadas), 0)::integer,
    coalesce(sum(b.a_proveedor), 0)::integer,
    coalesce(sum(b.cambiadas), 0)::integer,
    v_desde,
    v_hasta - 1
  from base b
  group by grouping sets ((b.producto_id), (b.talla), (b.origen_tipo, b.origen_id), (b.categoria_id), ())
  order by 1, 4 desc, 3;
end;
$function$

;

reset lock_timeout;

-- ============================== PARTE 2 · índice (pegar aparte) ==============================
-- La primera salida con empresa de una línea vendida (la regla de `fn_dueno_de_la_linea`, que ahora también usa
-- `fn_vendido_por_empresa`). Solo entran las salidas que llevan empresa —en CAYLA, lo de CLAURE—: el índice es chico y cada
-- pregunta «¿de quién es esta línea?» deja de leer todos los movimientos de la línea para descartarlos. Medido: con el año
-- entero, 1.352 → 849 ms; con 30 días, 205 → 84 ms (líder).
set lock_timeout = '3s';
create index if not exists movimientos_salida_con_empresa_idx
  on retail.movimientos (venta_item_id, created_at)
  where tipo = 'salida' and empresa_id is not null and venta_item_id is not null;
reset lock_timeout;
