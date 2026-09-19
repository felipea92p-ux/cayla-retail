-- ============================================================================
-- 20260919173000_reparto_compra_retira_destino_de_cabecera.sql — CAYLA V2 · ADR-0132 (parte 2 de 2)
--
-- Con el reparto por línea y por tienda (parte 1), `compras.ubicacion_destino_id` deja de ser la
-- verdad de «a dónde va la mercadería»: tener dos verdades (el destino en la factura y el reparto
-- aparte) permitiría un estado imposible. Esta parte la retira:
--
--   1. Re-llavea las 10 funciones que aún preguntaban por ese destino:
--        · lecturas de dinero y de Proveedores (solo líder, ADR-0126): `fn_puede_operar_ubicacion(c.ubicacion_destino_id)`
--          pasa a `fn_puede_ver_compra(c.id)` — para un líder es lo mismo que antes (ve todo);
--        · «Recibidas» (`resumen_recepciones`, `listar_recepciones_compras`, sección 1b): se reescriben POR TIENDA — cada
--          tienda ve lo que se recibió en SU tienda (el lote) y lo que aún le falta a ELLA; un líder ve todo.
--      Se parchan sobre su definición VIVA (conservan el candado de dinero de ADR-0126 que ya llevan).
--   2. Recrea la vista `compras_resumen` sin esa columna. `listar_compras` devuelve
--      `SETOF compras_resumen`, así que se suelta y se vuelve a crear con su definición viva.
--   3. Verifica que ninguna función ni política vuelva a leerla y ENTONCES elimina la columna. Si queda
--      un uso, la migración aborta con la lista y no cambia nada.
--   4. Reaplica el candado de dinero (`fn_aplicar_candado_de_dinero`), como pide ADR-0126 tras recrear
--      esas funciones.
--
-- Por qué en dos migraciones: la parte 1 es aditiva y compatible con la web de hoy; esta reescribe
-- funciones que ya están en producción. Separarlas deja cada pegado chico y verificable.
--
-- Re-pegable: lo ya re-llaveado se salta solo. ORDEN: después de 20260919172000, y ANTES de desplegar la
-- web nueva. Sin prefijo `retail.` (lleva `set search_path`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. Guardas ====================
do $$
begin
  if to_regclass('retail.compra_item_destinos') is null or to_regprocedure('retail.fn_puede_ver_compra(uuid)') is null then
    raise exception 'Falta la parte 1 del reparto (20260919172000): aplícala antes que esta';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicaciones_destino')
     and exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id') then
    raise exception 'compras_resumen no tiene ubicaciones_destino: la parte 1 no quedó completa';
  end if;
end $$;

-- ==================== 1. Re-llaveo de las funciones que leían el destino de la factura ====================
do $$
declare
  f record;
  v_def text;
  v_nuevo text;
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure::text as firma
    from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos',
                        'fn_proveedores', 'fn_proveedor_metricas_compras', 'fn_proveedor_costo_evolucion')
    order by p.proname, p.oid
  loop
    v_def := pg_get_functiondef(f.oid);
    continue when v_def not ilike '%ubicacion_destino_id%';   -- ya re-llaveada: re-pegable

    -- Lecturas de líder: «alguna línea del comprobante está repartida a mi tienda» (un líder ve todo).
    v_nuevo := regexp_replace(v_def, '(retail\.)?fn_puede_operar_ubicacion\(\s*(c2|c)\.ubicacion_destino_id\s*\)', 'fn_puede_ver_compra(\2.id)', 'g');
    v_nuevo := regexp_replace(v_nuevo, '(retail\.)?fn_puede_operar_ubicacion\(\s*ubicacion_destino_id\s*\)', 'fn_puede_ver_compra(id)', 'g');

    if v_nuevo ilike '%ubicacion_destino_id%' then
      raise exception 'No pude re-llavear %: quedan usos del destino de la factura que esta migración no sabe reemplazar (ADR-0132)', f.firma;
    end if;
    execute v_nuevo;
  end loop;
end $$;

-- ==================== 1b. «Recibidas», por tienda ====================
-- Cada tienda ve lo que se recibió en SU tienda (el lote) y lo que aún le falta a ELLA (no al comprobante
-- entero); un líder ve todo. Son dos funciones chicas: se reescriben completas, con la guarda de que sigan
-- siendo las de hoy (o ya las de esta migración).
do $$
declare v_a text; v_b text;
begin
  v_a := pg_get_functiondef(to_regprocedure('retail.resumen_recepciones(date)'));
  v_b := pg_get_functiondef(to_regprocedure('retail.listar_recepciones_compras(uuid,date,date,text,integer)'));
  if v_a is null or v_b is null then
    raise exception 'Faltan resumen_recepciones o listar_recepciones_compras con la firma esperada';
  end if;
  if v_a ilike '%ubicacion_destino_id%' and (v_a not like '%with r as (%' or v_a not like '%faltante as (%') then
    raise exception 'resumen_recepciones cambió desde que se escribió esta migración (ADR-0132): reescríbela sobre la definición viva';
  end if;
  if v_b ilike '%ubicacion_destino_id%' and v_b not like '%group by l.id, l.fecha_recepcion%' then
    raise exception 'listar_recepciones_compras cambió desde que se escribió esta migración (ADR-0132): reescríbela sobre la definición viva';
  end if;
end $$;

create or replace function resumen_recepciones(p_desde date default null)
 RETURNS TABLE(unidades_recibidas bigint, recepciones integer, dias_entrega_promedio numeric, comprobantes_recibidos integer, entregas_completas integer, faltante_unidades bigint, faltante_comprobantes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  with r as (
    -- Las mismas filas que lista `listar_recepciones_compras`, sin filtros extra.
    -- ADR-0132: cada tienda ve lo que se recibió en SU tienda (el lote); un líder ve todas.
    select l.id as lote, c.id as comprobante,
           sum(m.cantidad) as llegaron,
           greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision) as dias,
           (c.recibido_cantidad >= c.facturado_cantidad) as completo
    from lotes l
    join movimientos m on m.lote_id = l.id and m.compra_item_id is not null
    join compra_items ci on ci.id = m.compra_item_id
    join compras c on c.id = ci.compra_id
    where c.estado = 'vigente'
      and fn_puede_operar_ubicacion(l.ubicacion_id)
      and (l.fecha_recepcion at time zone 'America/Lima')::date >= coalesce(p_desde, fn_hoy_lima() - 90)
    group by l.id, l.fecha_recepcion, c.id, c.fecha_emision, c.recibido_cantidad, c.facturado_cantidad
  ),
  faltante as (
    -- Lo que aún falta, por tienda: un líder ve el total; un colaborador, el de su tienda.
    select c.id, sum(greatest(rs.pendiente, 0)) as pendiente
    from compras c
    join compra_item_reparto_resumen rs on rs.compra_id = c.id
    where c.estado = 'vigente' and c.estado_recepcion = 'parcial'
      and fn_puede_operar_ubicacion(rs.ubicacion_id)
    group by c.id
    having sum(greatest(rs.pendiente, 0)) > 0
  )
  select
    coalesce((select sum(r.llegaron) from r), 0)::bigint,
    (select count(distinct r.lote) from r)::integer,
    (select round(avg(r.dias), 1) from r),
    (select count(distinct r.comprobante) from r)::integer,
    (select count(distinct r.comprobante) from r where r.completo)::integer,
    coalesce((select sum(f.pendiente) from faltante f), 0)::bigint,
    (select count(*) from faltante f)::integer
  where auth.uid() is not null;
$function$;

create or replace function listar_recepciones_compras(p_proveedor_id uuid default null, p_desde date default null, p_hasta date default null, p_busqueda text default null, p_limite integer default 30)
 RETURNS TABLE(lote_id uuid, fecha_recepcion timestamp with time zone, ubicacion_nombre text, proveedor_id uuid, proveedor_nombre text, numero_guia text, recibido_por uuid, compra_id uuid, documento text, unidades_llegaron integer, unidades_facturadas integer, faltante integer, dias_demora integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select
    l.id,
    l.fecha_recepcion,
    u.nombre,
    c.proveedor_id,
    pr.nombre,
    l.numero_guia,
    l.recibido_por,
    c.id,
    c.documento,
    sum(m.cantidad)::integer,
    -- ADR-0132: lo asignado y lo que falta, de las tiendas que la persona opera (un líder, todas: el total).
    (select coalesce(sum(rs.asignado), 0)::integer from compra_item_reparto_resumen rs
      where rs.compra_id = c.id and fn_puede_operar_ubicacion(rs.ubicacion_id)),
    (select coalesce(sum(greatest(rs.pendiente, 0)), 0)::integer from compra_item_reparto_resumen rs
      where rs.compra_id = c.id and fn_puede_operar_ubicacion(rs.ubicacion_id)),
    greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c.fecha_emision)::integer
  from lotes l
  join movimientos m on m.lote_id = l.id and m.compra_item_id is not null
  join compra_items ci on ci.id = m.compra_item_id
  join compras c on c.id = ci.compra_id
  join proveedores pr on pr.id = c.proveedor_id
  join ubicaciones u on u.id = l.ubicacion_id
  where auth.uid() is not null
    and c.estado = 'vigente'
    and fn_puede_operar_ubicacion(l.ubicacion_id)
    and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
    and (p_desde is null or (l.fecha_recepcion at time zone 'America/Lima')::date >= p_desde)
    and (p_hasta is null or (l.fecha_recepcion at time zone 'America/Lima')::date <= p_hasta)
    and (nullif(trim(p_busqueda), '') is null
         or c.documento ilike '%' || trim(p_busqueda) || '%'
         or pr.nombre ilike '%' || trim(p_busqueda) || '%'
         or l.numero_guia ilike '%' || trim(p_busqueda) || '%')
  group by l.id, l.fecha_recepcion, l.numero_guia, l.recibido_por, l.ubicacion_id,
           u.nombre, c.id, c.proveedor_id, c.documento, c.fecha_emision, pr.nombre
  order by l.fecha_recepcion desc, l.id asc, c.id asc
  limit greatest(1, least(coalesce(p_limite, 30), 200));
$function$;


-- ==================== 2. La vista sin la columna vieja (y listar_compras, que devuelve su tipo) ====================
do $$
declare
  v_oid oid;
  v_firma text;
  v_def text;
  v_n integer;
begin
  -- ya hecho: re-pegable
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicacion_destino_id') then
    return;
  end if;

  -- Se compara por TIPO (no por texto: con `retail` en el search_path Postgres lo muestra sin prefijo).
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname = 'listar_compras'
     and p.proretset and p.prorettype = (select c.reltype from pg_class c where c.oid = 'retail.compras_resumen'::regclass);
  if v_n <> 1 then
    raise exception 'Esperaba UNA función listar_compras que devuelva SETOF compras_resumen y encontré %: revisa las sobrecargas', v_n;
  end if;
  select p.oid into v_oid from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname = 'listar_compras'
     and p.proretset and p.prorettype = (select c.reltype from pg_class c where c.oid = 'retail.compras_resumen'::regclass);
  v_firma := v_oid::regprocedure::text;
  v_def := pg_get_functiondef(v_oid);

  execute format('drop function %s', v_firma);
  drop view compras_resumen;

  create view compras_resumen with (security_invoker = true) as
   SELECT c.id,
      c.proveedor_id,
      p.nombre AS proveedor_nombre,
      p.ruc AS proveedor_ruc,
      c.tipo,
      c.serie,
      c.numero,
      c.documento,
      c.fecha_emision,
      c.condicion,
      c.fecha_vencimiento,
      c.subtotal,
      c.igv,
      c.total,
      c.estado,
      c.nota,
      c.created_at,
      c.pagado,
      c.saldo,
      c.estado_pago,
      c.facturado_cantidad,
      c.recibido_cantidad,
      c.estado_recepcion,
      c.estado = 'vigente'::text AND c.saldo > 0::numeric AND c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < retail.fn_hoy_lima() AS vencida,
      c.fecha_estimada_llegada,
      c.estado = 'vigente'::text AND (c.estado_recepcion = ANY (ARRAY['sin_recibir'::text, 'parcial'::text])) AND retail.fn_hoy_lima() > COALESCE(c.fecha_estimada_llegada, c.fecha_emision + 7) AS recepcion_atrasada,
      p.telefono AS proveedor_telefono,
      p.banco AS proveedor_banco,
      p.cuenta_bancaria AS proveedor_cuenta_bancaria,
      c.notas_credito,
      c.cerrado_cantidad,
      (select array_agg(distinct d.ubicacion_id order by d.ubicacion_id)
         from retail.compra_items ci2
         join retail.compra_item_destinos d on d.compra_item_id = ci2.id
        where ci2.compra_id = c.id) AS ubicaciones_destino
     FROM retail.compras c
       JOIN retail.proveedores p ON p.id = c.proveedor_id;

  revoke insert, update, delete, truncate on compras_resumen from authenticated, anon;
  grant select on compras_resumen to authenticated;

  -- la misma listar_compras de antes, sobre la vista nueva
  execute v_def;
  execute format('revoke all on function %s from public, anon', v_firma);
  execute format('grant execute on function %s to authenticated', v_firma);
end $$;

-- ==================== 3. Verificación y baja de la columna ====================
do $$
declare
  v_restan text;
begin
  select string_agg(distinct p.oid::regprocedure::text, E'\n  ') into v_restan
  from pg_proc p
  where p.pronamespace = 'retail'::regnamespace
    and (
      p.prosrc ~* '\m(compras|c|c2|compra|v_compra|r)\.ubicacion_destino_id\M'
      or p.prosrc ~* 'fn_puede_operar_ubicacion\(\s*ubicacion_destino_id'
      or p.prosrc ~* 'insert\s+into\s+(retail\.)?compras\s*\([^;]*ubicacion_destino_id'
    )
    and p.prosrc ~* '\mcompras?\M|compra_item|compras_resumen';
  if v_restan is not null then
    raise exception E'Todavía hay funciones que leen compras.ubicacion_destino_id (ADR-0132); revísalas y re-llavéalas a mano antes de soltar la columna:\n  %', v_restan;
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'retail' and tablename like 'compra%'
                and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%ubicacion_destino_id%') then
    raise exception 'Todavía hay políticas de Compras que leen ubicacion_destino_id (ADR-0132)';
  end if;
end $$;

alter table compras drop column if exists ubicacion_destino_id;

-- ==================== 4. El candado de dinero, tras recrear funciones de indicadores (ADR-0126) ====================
select fn_aplicar_candado_de_dinero();

-- ==================== 5. Autoverificación ====================
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id')
     or exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicacion_destino_id') then
    raise exception 'Autoverificación: la columna ubicacion_destino_id sigue existiendo';
  end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'listar_compras') <> 1 then
    raise exception 'Autoverificación: listar_compras debe quedar con UNA sola firma';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos')
      and pg_get_functiondef(p.oid) not like '%fn_exige_dinero_de_compras%'
  ) then
    raise exception 'Autoverificación: una función de dinero de Compras quedó sin su candado (ADR-0126)';
  end if;
end $$;
