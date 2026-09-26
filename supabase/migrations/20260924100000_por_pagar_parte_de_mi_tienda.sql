-- ============================================================================
-- 20260924100000_por_pagar_parte_de_mi_tienda.sql — CAYLA V2 · ADR-0187 (Por pagar muestra la parte de MI tienda)
--
-- EL PROBLEMA PRIMERO. Trujillo registra una factura de S/ 10,000 repartida mitad Trujillo, mitad Arequipa (ADR-0184).
-- Arequipa ya veía sus S/ 5,000 («Mis partes», `fn_mis_partes_de_compras`). Pero Trujillo, la tienda GESTORA, veía en Por
-- pagar los S/ 10,000: «Deuda total», «Vencido», «Vence esta semana», la concentración, la deuda por vencimiento, las salidas
-- de caja y los subtotales de la lista sumaban `compras.saldo`, el saldo de la factura ENTERA. Y el pago venía lleno con
-- 10,000, aunque la base (`fn_pago_no_supera_tienda`) solo le deja pagar 5,000. Felipe (2026-09-23): «que cada tienda vea su
-- parte».
--
-- QUÉ HACE
--   1. `fn_deuda_visible(p_ids uuid[] default null)` — UNA regla para «cuánto debo en cada comprobante»:
--        · líder: el saldo de la factura entera (la deuda con el proveedor es de la empresa), como siempre;
--        · con un módulo de Compras: por cada factura vigente con saldo en la que una de SUS tiendas tiene parte, la suma de
--          `fn_saldo_de_tienda` de sus tiendas (su parte menos lo que pagó ella), más su parte (`total`) y lo que pagó
--          (`pagado`). Incluye las facturas que gestiona OTRA tienda: esa parte también la debe él.
--          `gestionada` dice si la factura la gestiona una de sus tiendas (esas son las que ve enteras en la lista).
--        · sin módulo: nada.
--      Solo devuelve comprobantes con algo por pagar (> 0). Nunca abre la factura ajena: devuelve id y montos de MI parte.
--   2. Las cifras de Por pagar leen de ahí en vez de `compras.saldo`: `resumen_compras` (deuda, con saldo, vencido, vencidas,
--      por vencer), `resumen_compras_extra` (concentración), `deuda_por_vencimiento`, `salidas_caja_30d` y `fn_proveedores`
--      (saldo y saldo vencido por proveedor: la barra de concentración y «A favor»). Para quien no es líder, suman lo que deben
--      SUS tiendas, gestione quien gestione la factura: «Deuda total» = la lista + «Mis partes».
--   3. `por_pagar_tramos` (los subtotales bajo la lista) suma SU parte, pero solo de las facturas que él gestiona: la lista
--      muestra esas, y los subtotales tienen que cuadrar con las filas (ADR-0111, H3). Las partes ajenas van en «Mis partes».
--   Para el líder NADA cambia: `fn_deuda_visible` le devuelve `compras.saldo`, igual que antes.
--
-- QUÉ NO HACE. No toca tablas ni datos. No cambia cómo se paga (el candado de 20260923180300 ya impedía pasarse de la parte).
-- No cambia los demás montos de la factura (Comprobantes, detalle): la factura sigue siendo un solo papel. `fn_proveedores`
-- solo cambia el saldo y el saldo vencido; lo facturado sigue siendo lo de las facturas que gestionan sus tiendas.
-- Caso borde conocido: si el líder paga parte de una factura SIN atribuirla a una tienda, `fn_saldo_de_tienda` topa cada
-- tienda con el saldo real de la factura, pero la suma de las dos tiendas puede pasar ese saldo hasta que el pago se reparta.
--
-- CÓMO. Las cinco funciones de indicadores se reescriben enteras partiendo de su definición VIVA de producción
-- (`pg_get_functiondef`, 2026-09-23), con la MISMA firma (no nace ninguna sobrecarga) y el candado de dinero en su primera
-- línea; al final se reaplica `fn_aplicar_candado_de_dinero()` y se exige que devuelva `{}`. `fn_proveedores` se parcha con
-- anclas (es larga y la usan otras pantallas): cada ancla tiene que aparecer las veces esperadas o aborta sin cambiar nada.
--
-- PARA PEGAR EN PRODUCCIÓN: después de 20260923180000 … 180500 (ya pegadas). Trae `set search_path`. Re-pegable.
-- ORDEN respecto de la web: pegar ANTES de fusionar el PR (la web llama a `fn_deuda_visible`).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_saldo_de_tienda(uuid,uuid)') is null or to_regclass('retail.compra_parte_por_tienda') is null
     or to_regprocedure('retail.fn_compras_ubicaciones()') is null then
    raise exception 'Faltan 20260923180000 … 180300 (tiendas de Compras, parte por tienda y pagar por tienda)';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_gestion_id') then
    raise exception 'Falta 20260923180200 (compras.ubicacion_gestion_id)';
  end if;
  if to_regprocedure('retail.fn_aplicar_candado_de_dinero()') is null then
    raise exception 'Falta el candado de dinero de Compras (ADR-0126)';
  end if;
end $$;

-- ==================== 1. cuánto debo en cada comprobante ====================
create or replace function retail.fn_deuda_visible(p_ids uuid[] default null)
returns table(compra_id uuid, total numeric, pagado numeric, saldo numeric, gestionada boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tiendas uuid[];
begin
  if auth.uid() is null then
    return;
  end if;

  -- El líder: la factura entera, como siempre.
  if retail.fn_es_lider() then
    return query
      select c.id, c.total, c.pagado, c.saldo, true
        from retail.compras c
       where c.estado = 'vigente' and c.saldo > 0
         and (p_ids is null or c.id = any(p_ids));
    return;
  end if;

  -- Con módulo de Compras: sus tiendas. Sin módulo, `{}` y nada que mostrar.
  v_tiendas := retail.fn_compras_ubicaciones();
  if coalesce(cardinality(v_tiendas), 0) = 0 then
    return;
  end if;

  -- La parte se lee por factura (lateral con `compra_id = c.id`): la vista reparte por factura y así no calcula el reparto
  -- de todo el historial, solo de lo que tiene saldo.
  return query
    select c.id,
           sum(pt.total)::numeric(12, 2),
           coalesce(sum(pg.pagado), 0)::numeric(12, 2),
           sum(retail.fn_saldo_de_tienda(c.id, pt.ubicacion_id))::numeric(12, 2),
           coalesce(c.ubicacion_gestion_id = any(v_tiendas), false)
      from retail.compras c
      cross join lateral (
        select p.ubicacion_id, p.total from retail.compra_parte_por_tienda p
         where p.compra_id = c.id and p.ubicacion_id = any(v_tiendas)
      ) pt
      left join lateral (
        select sum(x.monto) as pagado from retail.compra_pagos x where x.compra_id = c.id and x.ubicacion_id = pt.ubicacion_id
      ) pg on true
     where c.estado = 'vigente' and c.saldo > 0
       and (p_ids is null or c.id = any(p_ids))
     group by c.id, c.ubicacion_gestion_id
    having sum(retail.fn_saldo_de_tienda(c.id, pt.ubicacion_id)) > 0;
end;
$$;

comment on function retail.fn_deuda_visible(uuid[]) is
  'ADR-0187. Lo que debe quien consulta en cada comprobante vigente con saldo: el líder, la factura entera; con módulo de Compras, la parte de SUS tiendas (fn_saldo_de_tienda), gestione quien gestione la factura; sin módulo, nada. `gestionada` = la gestiona una de sus tiendas. Fuente única de las cifras de Por pagar.';

revoke all on function retail.fn_deuda_visible(uuid[]) from public, anon;
grant execute on function retail.fn_deuda_visible(uuid[]) to authenticated;

-- ==================== 2. las cifras de Por pagar ====================
create or replace function retail.resumen_compras()
returns table(registradas bigint, vigentes bigint, por_recibir bigint, deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint, por_vencer bigint, por_vencer_monto numeric, por_recibir_atrasadas bigint)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.
  select retail.fn_exige_dinero_de_compras('las cifras de dinero de Compras');
  -- ADR-0187: la deuda es la de MIS tiendas (`fn_deuda_visible`); el líder, la de la empresa.
  with d as materialized (
    select v.saldo, c.fecha_vencimiento
      from retail.fn_deuda_visible() v
      join compras c on c.id = v.compra_id
  )
  select
    (select count(*) from compras where fn_compra_es_de_mis_tiendas(id)),
    (select count(*) from compras where estado = 'vigente' and fn_compra_es_de_mis_tiendas(id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial') and fn_compra_es_de_mis_tiendas(id)),
    (select coalesce(sum(d.saldo), 0) from d),
    (select count(*) from d),
    (select coalesce(sum(d.saldo), 0) from d where d.fecha_vencimiento < fn_hoy_lima()),
    (select count(*) from d where d.fecha_vencimiento < fn_hoy_lima()),
    (select count(*) from d where d.fecha_vencimiento between fn_hoy_lima() and fn_hoy_lima() + 7),
    (select coalesce(sum(d.saldo), 0) from d where d.fecha_vencimiento between fn_hoy_lima() and fn_hoy_lima() + 7),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial')
       and fn_hoy_lima() > coalesce(fecha_estimada_llegada, fecha_emision + 7) and fn_compra_es_de_mis_tiendas(id))
  where auth.uid() is not null;
$$;

create or replace function retail.deuda_por_vencimiento()
returns table(tramo text, comprobantes integer, monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.
  select retail.fn_exige_dinero_de_compras('la deuda por vencimiento');
  with h as (select fn_hoy_lima() as hoy),
  deuda as (
    -- ADR-0187: lo que deben MIS tiendas (`fn_deuda_visible`); el líder, la empresa.
    select c.id, v.saldo,
      case
        when c.fecha_vencimiento < h.hoy then 'vencida'
        when coalesce(c.fecha_vencimiento, h.hoy) <= h.hoy + 7 then '0_7'
        when c.fecha_vencimiento <= h.hoy + 30 then '8_30'
        else 'mas_30'
      end as tramo_calculado
    from retail.fn_deuda_visible() v
    join compras c on c.id = v.compra_id
    cross join h
  )
  select t.nombre, count(d.id)::integer, coalesce(sum(d.saldo), 0)::numeric
  from (values (1, 'vencida'), (2, '0_7'), (3, '8_30'), (4, 'mas_30')) as t(orden, nombre)
  left join deuda d on d.tramo_calculado = t.nombre
  where auth.uid() is not null
  group by t.orden, t.nombre
  order by t.orden;
$$;

create or replace function retail.salidas_caja_30d()
returns table(orden integer, etiqueta text, desde date, hasta date, comprobantes integer, monto numeric, es_vencido boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.
  select retail.fn_exige_dinero_de_compras('las salidas de caja de Compras');
  with h as (select fn_hoy_lima() as hoy),
  meses as (select array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'] as abrev),
  cubetas as (
    select 0 as orden, 'Vencido'::text as etiqueta, null::date as desde, (h.hoy - 1) as hasta, true as es_vencido
    from h
    union all
    select g,
      case
        when extract(month from h.hoy + 7 * (g - 1)) = extract(month from h.hoy + 7 * g - 1)
          then extract(day from h.hoy + 7 * (g - 1))::integer || '–' || extract(day from h.hoy + 7 * g - 1)::integer
               || ' ' || m.abrev[extract(month from h.hoy + 7 * g - 1)::integer]
        else extract(day from h.hoy + 7 * (g - 1))::integer || ' ' || m.abrev[extract(month from h.hoy + 7 * (g - 1))::integer]
               || '–' || extract(day from h.hoy + 7 * g - 1)::integer || ' ' || m.abrev[extract(month from h.hoy + 7 * g - 1)::integer]
      end,
      h.hoy + 7 * (g - 1), h.hoy + 7 * g - 1, false
    from h cross join meses m cross join generate_series(1, 4) as g
    union all
    select 5, 'Después', h.hoy + 28, null::date, false from h
  ),
  deuda as (
    -- ADR-0187: lo que deben MIS tiendas (`fn_deuda_visible`); el líder, la empresa.
    select c.id, v.saldo, coalesce(c.fecha_vencimiento, h.hoy) as vence
    from retail.fn_deuda_visible() v
    join compras c on c.id = v.compra_id
    cross join h
  )
  select cu.orden, cu.etiqueta, cu.desde, cu.hasta,
         count(d.id)::integer, coalesce(sum(d.saldo), 0)::numeric, cu.es_vencido
  from cubetas cu
  left join deuda d
    on (cu.desde is null or d.vence >= cu.desde)
   and (cu.hasta is null or d.vence <= cu.hasta)
  where auth.uid() is not null
  group by cu.orden, cu.etiqueta, cu.desde, cu.hasta, cu.es_vencido
  order by cu.orden;
$$;

create or replace function retail.por_pagar_tramos(p_proveedor_id uuid default null::uuid, p_condicion text default null::text, p_solo_vencidas boolean default false, p_busqueda text default null::text, p_tipo text default null::text, p_desde date default null::date, p_hasta date default null::date, p_ubicacion_id uuid default null::uuid)
returns table(tramo text, comprobantes integer, saldo numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := fn_hoy_lima();
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.
  perform retail.fn_exige_dinero_de_compras('lo que hay por pagar');
  if auth.uid() is null then
    return;
  end if;
  if v_busqueda is not null then
    select coalesce(array_agg(pr.id), '{}') into v_proveedores
    from proveedores pr where pr.nombre ilike '%' || v_busqueda || '%';
  end if;

  -- ADR-0187: MI parte (`fn_deuda_visible`), pero solo de las facturas que gestionan mis tiendas: son las filas de la lista,
  -- y estos subtotales tienen que cuadrar con ellas. Las partes en facturas ajenas van en «Mis partes».
  return query
    select t.nombre, count(d.id)::integer, coalesce(sum(d.saldo_comprobante), 0)::numeric
    from (values (1, 'vencidas'), (2, 'semana'), (3, 'despues')) as t(orden, nombre)
    left join (
      select c.id, v.saldo as saldo_comprobante,
        case
          when c.fecha_vencimiento < v_hoy then 'vencidas'
          when coalesce(c.fecha_vencimiento, v_hoy) <= v_hoy + 7 then 'semana'
          else 'despues'
        end as tramo_calculado
      from retail.fn_deuda_visible() v
      join compras c on c.id = v.compra_id
      where v.gestionada
        and (p_proveedor_id is null or c.proveedor_id = p_proveedor_id)
        and (p_condicion is null or c.condicion = p_condicion)
        and (p_tipo is null or c.tipo = p_tipo)
        and (not p_solo_vencidas or c.fecha_vencimiento < v_hoy)
        and (p_desde is null or c.fecha_emision >= p_desde)
        and (p_hasta is null or c.fecha_emision <= p_hasta)
        and (p_ubicacion_id is null or exists (
          select 1 from compra_item_destinos d join compra_items i on i.id = d.compra_item_id
          where i.compra_id = c.id and d.ubicacion_id = p_ubicacion_id))
        and (v_busqueda is null or c.documento ilike '%' || v_busqueda || '%' or c.proveedor_id = any(v_proveedores))
    ) d on d.tramo_calculado = t.nombre
    group by t.orden, t.nombre
    order by t.orden;
end;
$$;

-- ==================== 3. parches con anclas: concentración y proveedores ====================
-- Reemplaza `patron` (expresión regular: los espacios del texto vivo pueden variar) en el texto de una función, exigiendo que
-- aparezca exactamente `veces` veces; si no, aborta sin cambiar nada. Los parches de una función se hacen todos en memoria y
-- se ejecuta UNA vez (un parche suelto dejaría la función a medias). Si la función ya lleva `fn_deuda_visible()`, se salta
-- (re-pegar).
create or replace function pg_temp.reemplazar(p_fn text, p_def text, p_patron text, p_nuevo text, p_veces integer)
returns text language plpgsql as $$
declare
  v_hay integer;
begin
  select count(*) into v_hay from regexp_matches(p_def, p_patron, 'g');
  if v_hay <> p_veces then
    raise exception '%: se esperaban % apariciones de «%» y hay %. La función cambió en la base: revisar antes de pegar.', p_fn, p_veces, p_patron, v_hay;
  end if;
  return regexp_replace(p_def, p_patron, p_nuevo, 'g');
end;
$$;

-- 3.1 resumen_compras_extra: quién concentra MI deuda.
do $$
declare
  v_def text := pg_get_functiondef('retail.resumen_compras_extra()'::regprocedure);
begin
  if position('fn_deuda_visible()' in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.reemplazar('resumen_compras_extra', v_def,
    'select c\.proveedor_id, sum\(c\.saldo\) as saldo_prov\s+from compras c\s+where c\.estado = ''vigente'' and c\.saldo > 0\s+and fn_compra_es_de_mis_tiendas\(c\.id\)\s+group by c\.proveedor_id',
    'select c.proveedor_id, sum(v.saldo) as saldo_prov
    from retail.fn_deuda_visible() v -- ADR-0187: MI deuda
    join compras c on c.id = v.compra_id
    group by c.proveedor_id', 1);
  execute v_def;
end $$;

-- 3.2 fn_proveedores: saldo y saldo vencido = lo que deben MIS tiendas a cada proveedor.
do $$
declare
  v_def text := pg_get_functiondef('retail.fn_proveedores()'::regprocedure);
begin
  if position('fn_deuda_visible()' in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.reemplazar('fn_proveedores', v_def,
    'coalesce\(sum\(c\.saldo\) filter \(where c\.estado <> ''anulada''\), 0\) end as saldo,',
    'coalesce(dv.saldo, 0) end as saldo,', 1);
  v_def := pg_temp.reemplazar('fn_proveedores', v_def,
    'coalesce\(sum\(c\.saldo\) filter \(where c\.estado = ''vigente'' and c\.saldo > 0 and c\.fecha_vencimiento < fn_hoy_lima\(\)\), 0\) end as saldo_vencido',
    'coalesce(dv.vencido, 0) end as saldo_vencido', 1);
  v_def := pg_temp.reemplazar('fn_proveedores', v_def,
    'from retail\.proveedores p\s+left join retail\.compras c',
    'from retail.proveedores p
  -- ADR-0187: el saldo es lo que deben MIS tiendas (`fn_deuda_visible`); el líder, la empresa.
  left join (
    select x.proveedor_id, sum(v.saldo) as saldo, sum(v.saldo) filter (where x.fecha_vencimiento < fn_hoy_lima()) as vencido
      from retail.fn_deuda_visible() v
      join retail.compras x on x.id = v.compra_id
     group by x.proveedor_id
  ) dv on dv.proveedor_id = p.id
  left join retail.compras c', 1);
  v_def := pg_temp.reemplazar('fn_proveedores', v_def,
    'p\.cci, p\.celular_billetera, p\.billeteras, p\.titular_cuenta\s+order by',
    'p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta, dv.saldo, dv.vencido
  order by', 1);
  execute v_def;
end $$;

-- ==================== 4. candado y comprobaciones ====================
select retail.fn_aplicar_candado_de_dinero();

do $$
declare
  v_pendientes text;
  v_firmas integer;
begin
  select retail.fn_aplicar_candado_de_dinero()::text into v_pendientes;
  if v_pendientes <> '{}' then
    raise exception 'Quedaron funciones sin el candado de dinero: %', v_pendientes;
  end if;
  select count(*) into v_firmas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail'
     and p.proname in ('fn_deuda_visible', 'resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos', 'fn_proveedores');
  if v_firmas <> 7 then
    raise exception 'Se esperaban 7 funciones con una sola firma cada una y hay %', v_firmas;
  end if;
end $$;
