-- Plan de campaña: proponer los tres escenarios, «lo que sobra» de CAYLA y los resultados de una campaña (ADR-0372, C4–C6 · Felipe 2026-10-12).
--
-- EL PROBLEMA PRIMERO. Hasta hoy el plan proponía un solo número (el normal = 3 meses de los últimos 90 días) y el flojo, el bueno y «a qué
-- % se vende lo que sobra» los escribía cada quien de memoria. Y cuando la campaña terminaba, nadie medía cuánto se vendió de verdad por
-- tienda, prenda y color, ni cuántas veces más que un día normal: el año siguiente se volvía a adivinar. Esta migración da los HECHOS; las
-- reglas que los convierten en una propuesta viven en la web (`lib/plan-compra-propuesta.ts`, con su prueba), donde se pueden leer y probar.
--
-- LAS REGLAS DE FELIPE (2026-10-12), para entender qué hechos se piden:
--   · Normal = lo que vende un mes estándar (los últimos 90 días con ERP, llevados a 30 días).
--   · Flojo = el mes más bajo de los últimos 6 (ventanas de 30 días completas dentro del ERP).
--   · Bueno = normal × 3 mientras no haya campaña anterior en el ERP; cuando la hay, el punto medio entre «normal × el multiplicador real
--     de esa tienda» y «lo que vendió esa categoría en la misma campaña el año pasado»; si esa categoría se AGOTÓ (quedó en cero antes de
--     terminar), no se promedia: lo vendido quedó corto por falta de stock, no de clientes.
--   · Lo que sobra = un % de CAYLA por campaña, fijado por un líder; cada categoría puede cambiarlo.
--
-- QUÉ CREA.
--   1. `fn_unidades_vendidas(desde, hasta)`: lo vendido por día de Lima, tienda, categoría, prenda y color, con su prenda o anotado «sin
--      registrar»; solo categorías que cuentan en los motores (ADR-0377). UNA definición para la propuesta y los resultados. No se expone
--      a la web (sin permiso para `authenticated`): la llaman las funciones de abajo.
--   2. `fn_stock_categoria_al(momento)`: el stock de cada categoría en cada tienda en un momento pasado = el de hoy menos lo que se movió
--      después (los mismos efectos que el ledger, ADR-0230/`20260924030000`); sin Cuarentena. Para decir «se agotó».
--   3. `planes_compra.recupero_defecto_pct` (+ autor y hora; un % nunca existe sin quién lo fijó) y `guardar_plan_compra_recupero`: solo
--      un líder, firma el responsable del combo (ADR-0162). Una campaña sin el suyo hereda el de la campaña anterior más reciente.
--   4. `fn_plan_compra_propuesta(plan)`: los hechos por tienda y categoría para proponer flojo, normal y bueno.
--   5. `fn_plan_compra_resultados(plan)`: lo que se vendió en la campaña por tienda, familia, categoría, prenda y color; el multiplicador
--      real de cada tienda; las categorías que se agotaron; y, terminada la campaña, a qué % del precio se vendió lo de después (lo que sobró).
--   Todas las lecturas piden el módulo `plan_compra`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Un `alter table` de una tabla chica (planes_compra) y funciones nuevas; sin políticas ni
-- `drop trigger` (ADR-0195). No toca `fn_plan_compra` ni `guardar_plan_compra_linea`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Lo vendido, una sola definición
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function retail.fn_unidades_vendidas(p_desde timestamptz, p_hasta timestamptz)
returns table (fecha date, ubicacion_id uuid, categoria_id uuid, producto_id uuid, color_codigo text, unidades integer, soles numeric, a_precio_lista numeric)
language sql
stable
set search_path = retail, public, extensions
as $$
  select (v.created_at at time zone 'America/Lima')::date, v.ubicacion_id, pr.categoria_id, pr.id, va.color_codigo, vi.cantidad, vi.subtotal,
         vi.cantidad * coalesce(nullif(va.precio, 0), vi.precio_unitario)
    from retail.ventas v
    join retail.venta_items vi on vi.venta_id = v.id
    join retail.variantes va on va.id = vi.variante_id
    join retail.productos pr on pr.id = va.producto_id
   where v.estado = 'completada' and not v.es_prueba and not pr.es_prueba
     and vi.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid
     and pr.categoria_id is not null and retail.fn_categoria_entra_a_motores(pr.categoria_id)
     and v.created_at >= p_desde and v.created_at < p_hasta
  union all
  -- Lo anotado «sin registrar» (ADR-0328): una prenda por anotación, con su categoría y color; se cobró `precio_cobrado`.
  select (v.created_at at time zone 'America/Lima')::date, v.ubicacion_id, p.categoria_id, null::uuid, p.color_codigo, 1, p.precio_cobrado,
         coalesce(nullif(p.precio_oficial, 0), p.precio_cobrado)
    from retail.prendas_por_regularizar p
    join retail.venta_items vi on vi.id = p.venta_item_id
    join retail.ventas v on v.id = vi.venta_id
   where p.estado in ('pendiente', 'cerrada_sin_prenda') and p.categoria_id is not null and retail.fn_categoria_entra_a_motores(p.categoria_id)
     and v.estado = 'completada' and not v.es_prueba
     and v.created_at >= p_desde and v.created_at < p_hasta
$$;

revoke all on function retail.fn_unidades_vendidas(timestamptz, timestamptz) from public, anon, authenticated;
comment on function retail.fn_unidades_vendidas(timestamptz, timestamptz) is
  'ADR-0372 (C4–C6): lo vendido por día de Lima, tienda, categoría, prenda y color (con su prenda o anotado sin registrar), solo categorías que cuentan en los motores. Uso interno de fn_plan_compra_propuesta y fn_plan_compra_resultados.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. El stock de una categoría en un momento pasado
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function retail.fn_stock_categoria_al(p_momento timestamptz)
returns table (ubicacion_id uuid, categoria_id uuid, unidades integer)
language sql
stable
set search_path = retail, public, extensions
as $$
  with movido as (
    -- Lo que cambió el stock DESPUÉS del momento (mismos efectos que el ledger): se le resta al de hoy para volver atrás.
    select m.ubicacion_id, m.variante_id,
           case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta
      from retail.movimientos m
      left join retail.sububicaciones su on su.id = m.sububicacion_id
     where m.created_at >= p_momento and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado') and su.tipo is distinct from 'cuarentena'
    union all
    select m.ubicacion_destino_id, m.variante_id, m.cantidad
      from retail.movimientos m
      left join retail.sububicaciones su on su.id = m.sububicacion_destino_id
     where m.created_at >= p_momento and m.tipo = 'traslado' and m.ubicacion_destino_id is not null and su.tipo is distinct from 'cuarentena'
  ),
  por_variante as (
    select s.ubicacion_id, s.variante_id, s.cantidad as q
      from retail.stock s
      left join retail.sububicaciones su on su.id = s.sububicacion_id
     where su.tipo is distinct from 'cuarentena'
    union all
    select mv.ubicacion_id, mv.variante_id, -mv.delta from movido mv
  )
  select x.ubicacion_id, pr.categoria_id, sum(x.q)::integer
    from por_variante x
    join retail.variantes va on va.id = x.variante_id
    join retail.productos pr on pr.id = va.producto_id
   where x.variante_id <> '22222222-2222-4222-8222-222222222222'::uuid and pr.categoria_id is not null and not pr.es_prueba
   group by 1, 2
$$;

revoke all on function retail.fn_stock_categoria_al(timestamptz) from public, anon, authenticated;
comment on function retail.fn_stock_categoria_al(timestamptz) is
  'ADR-0372 (C4–C6): el stock de cada categoría por tienda en un momento pasado (el de hoy menos lo movido después), sin Cuarentena. Uso interno: decir si una categoría se agotó en una campaña.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Lo que sobra: el % de CAYLA por campaña
-- ---------------------------------------------------------------------------------------------------------------------
alter table retail.planes_compra
  add column if not exists recupero_defecto_pct integer check (recupero_defecto_pct is null or recupero_defecto_pct between 0 and 100),
  add column if not exists recupero_actualizado_por uuid references public.personas (id),
  add column if not exists recupero_actualizado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_recupero_con_autor' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra
      add constraint planes_compra_recupero_con_autor
      check (recupero_defecto_pct is null or (recupero_actualizado_por is not null and recupero_actualizado_en is not null));
  end if;
end $$;

comment on column retail.planes_compra.recupero_defecto_pct is
  'ADR-0372 (C5): a qué % del precio se vende lo que sobra de esta campaña, para todas sus categorías (cada una puede cambiarlo en su línea). NULL = hereda el de la campaña anterior más reciente.';

create or replace function retail.guardar_plan_compra_recupero(p_plan_id uuid, p_pct integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Fijar lo que sobra necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if retail.fn_es_lider() is not true then
    raise exception 'Solo un líder fija a qué %% se vende lo que sobra' using errcode = '42501', hint = 'plan_compra_solo_lider';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then
    raise exception 'Lo que sobra va de 0 a 100 %% del precio.' using hint = 'plan_compra_recupero';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  update retail.planes_compra
     set recupero_defecto_pct = p_pct,
         recupero_actualizado_por = case when p_pct is null then null else v_persona end,
         recupero_actualizado_en = case when p_pct is null then null else now() end
   where id = p_plan_id;
  return jsonb_build_object('plan_id', p_plan_id, 'recupero_defecto_pct', p_pct);
end;
$$;

revoke all on function retail.guardar_plan_compra_recupero(uuid, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_recupero(uuid, integer) to authenticated, service_role;
comment on function retail.guardar_plan_compra_recupero(uuid, integer) is
  'ADR-0372 (C5): fija (o quita, con NULL) el % de CAYLA al que se vende lo que sobra en una campaña. Pide el módulo plan_compra y ser líder; firma el responsable del combo (fn_actor_persona_id(true)).';

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Los hechos para proponer flojo, normal y bueno
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function retail.fn_plan_compra_propuesta(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_hoy date := retail.fn_hoy_lima();
  v_prev_desde date;
  v_prev_hasta date;
  v_recupero integer;
  v_heredado boolean := false;
  tz constant text := 'America/Lima';
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in select * from retail.planes_compra where id = p_plan_id loop exit; end loop;
  if v_plan.id is null then
    return null;
  end if;
  v_prev_desde := (v_plan.desde - interval '1 year')::date;
  v_prev_hasta := (v_plan.hasta - interval '1 year')::date;
  v_recupero := v_plan.recupero_defecto_pct;
  if v_recupero is null then
    v_recupero := (select p.recupero_defecto_pct from retail.planes_compra p
                    where p.id <> v_plan.id and p.recupero_defecto_pct is not null and p.archivado_en is null
                    order by p.desde desc limit 1);
    v_heredado := v_recupero is not null;
  end if;

  return (
    with arranque as (
      -- Desde qué día vende cada tienda en el ERP (la misma regla que el Historial).
      select v.ubicacion_id, min((v.created_at at time zone tz)::date) as erp_desde
        from retail.ventas v where v.estado = 'completada' and not v.es_prueba group by 1
    ),
    recientes as (
      select * from retail.fn_unidades_vendidas(((v_hoy - 180)::timestamp at time zone tz), (v_hoy::timestamp at time zone tz))
    ),
    previas as (
      select * from retail.fn_unidades_vendidas(((v_prev_desde - 60)::timestamp at time zone tz), ((v_prev_hasta + 1)::timestamp at time zone tz))
    ),
    tiendas as (
      select a.ubicacion_id, u.nombre, a.erp_desde,
             greatest(0, v_hoy - greatest(v_hoy - 90, a.erp_desde))::integer as dias_90,
             least(6, greatest(0, floor((v_hoy - a.erp_desde) / 30.0)))::integer as ventanas,
             (a.erp_desde <= v_prev_desde - 60) as previa_disponible
        from arranque a join retail.ubicaciones u on u.id = a.ubicacion_id
       where a.erp_desde < v_hoy
    ),
    multiplicadores as (
      select t.ubicacion_id,
             case when base.u > 0 then (camp.u::numeric / (v_prev_hasta - v_prev_desde + 1)) / (base.u::numeric / 60) end as multiplicador
        from tiendas t
        cross join lateral (select coalesce(sum(p.unidades), 0) as u from previas p where p.ubicacion_id = t.ubicacion_id and p.fecha >= v_prev_desde) camp
        cross join lateral (select coalesce(sum(p.unidades), 0) as u from previas p where p.ubicacion_id = t.ubicacion_id and p.fecha < v_prev_desde) base
       where t.previa_disponible
    ),
    stock_fin_previa as (
      select s.ubicacion_id, s.categoria_id, s.unidades from retail.fn_stock_categoria_al(((v_prev_hasta + 1)::timestamp at time zone tz)) s
       where exists (select 1 from tiendas t where t.ubicacion_id = s.ubicacion_id and t.previa_disponible)
    ),
    pares as (
      select distinct r.ubicacion_id, r.categoria_id from recientes r
      union
      select distinct p.ubicacion_id, p.categoria_id from previas p where p.fecha >= v_prev_desde
    )
    select jsonb_build_object(
      'plan_id', v_plan.id,
      'hoy', v_hoy,
      'dias_campana', v_plan.hasta - v_plan.desde + 1,
      'previa', jsonb_build_object('desde', v_prev_desde, 'hasta', v_prev_hasta),
      'recupero_defecto', jsonb_build_object('pct', v_recupero, 'heredado', v_heredado),
      'tiendas', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.ubicacion_id, 'nombre', t.nombre, 'erp_desde', t.erp_desde, 'dias_90', t.dias_90,
                                            'ventanas', t.ventanas, 'previa_disponible', t.previa_disponible,
                                            'multiplicador', (select round(m.multiplicador, 3) from multiplicadores m where m.ubicacion_id = t.ubicacion_id))
                         order by t.nombre)
          from tiendas t), '[]'::jsonb),
      'categorias', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'c', pa.categoria_id, 'u', pa.ubicacion_id,
                 'u90', (select coalesce(sum(r.unidades), 0) from recientes r where r.ubicacion_id = pa.ubicacion_id and r.categoria_id = pa.categoria_id and r.fecha >= v_hoy - 90),
                 -- Ventana k (1 = la más reciente): los 30 días que terminan 30·(k−1) días antes de hoy.
                 'ventanas', (select jsonb_agg((select coalesce(sum(r.unidades), 0) from recientes r
                                                  where r.ubicacion_id = pa.ubicacion_id and r.categoria_id = pa.categoria_id
                                                    and r.fecha >= v_hoy - 30 * k and r.fecha < v_hoy - 30 * (k - 1)) order by k)
                                from generate_series(1, 6) k),
                 'previa', (select coalesce(sum(p.unidades), 0) from previas p where p.ubicacion_id = pa.ubicacion_id and p.categoria_id = pa.categoria_id and p.fecha >= v_prev_desde),
                 -- Se agotó: la tienda tiene campaña anterior, la categoría vendió en ella y al cerrar quedó en cero. Sin fila de stock = cero
                 -- (una categoría que se vendió tuvo stock alguna vez; si hoy no queda ni una fila ni nada movido después, es que no quedó).
                 'agotada', exists (select 1 from tiendas t where t.ubicacion_id = pa.ubicacion_id and t.previa_disponible)
                            and exists (select 1 from previas p where p.ubicacion_id = pa.ubicacion_id and p.categoria_id = pa.categoria_id and p.fecha >= v_prev_desde)
                            and coalesce((select s.unidades from stock_fin_previa s where s.ubicacion_id = pa.ubicacion_id and s.categoria_id = pa.categoria_id), 0) <= 0))
          from pares pa
         where exists (select 1 from tiendas t where t.ubicacion_id = pa.ubicacion_id)), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_plan_compra_propuesta(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_propuesta(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_propuesta(uuid) is
  'ADR-0372 (C4): los hechos para proponer flojo, normal y bueno de cada categoría: por tienda, sus ventas de 90 días y de 6 ventanas de 30, lo vendido en la misma campaña el año anterior, el multiplicador real de la tienda y si la categoría se agotó; y el % de lo que sobra (propio o heredado). Pide el módulo plan_compra.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Los resultados de una campaña
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function retail.fn_plan_compra_resultados(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_hoy date := retail.fn_hoy_lima();
  v_fin date;
  v_despues_hasta date;
  tz constant text := 'America/Lima';
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol' using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in select * from retail.planes_compra where id = p_plan_id loop exit; end loop;
  if v_plan.id is null then
    return null;
  end if;
  -- Lo medido llega hasta ayer (hoy todavía se vende) o hasta el fin de la campaña.
  v_fin := least(v_plan.hasta, v_hoy - 1);
  -- Lo que sobró: lo vendido en los 60 días después de la campaña (hasta ayer).
  v_despues_hasta := least(v_plan.hasta + 60, v_hoy - 1);

  return (
    with arranque as (
      select v.ubicacion_id, min((v.created_at at time zone tz)::date) as erp_desde
        from retail.ventas v where v.estado = 'completada' and not v.es_prueba group by 1
    ),
    vendido as (
      select * from retail.fn_unidades_vendidas(((v_plan.desde - 60)::timestamp at time zone tz), ((v_fin + 1)::timestamp at time zone tz))
    ),
    despues as (
      select * from retail.fn_unidades_vendidas(((v_plan.hasta + 1)::timestamp at time zone tz), ((v_despues_hasta + 1)::timestamp at time zone tz))
       where v_despues_hasta > v_plan.hasta
    ),
    agotadas as (
      -- Lo que se vendió en la campaña y, al cerrar lo medido, quedó en cero (sin fila de stock = cero).
      select distinct x.ubicacion_id, x.categoria_id
        from vendido x
        left join retail.fn_stock_categoria_al(((v_fin + 1)::timestamp at time zone tz)) s on s.ubicacion_id = x.ubicacion_id and s.categoria_id = x.categoria_id
       where x.fecha >= v_plan.desde and coalesce(s.unidades, 0) <= 0
    )
    select jsonb_build_object(
      'plan', jsonb_build_object('id', v_plan.id, 'nombre', v_plan.nombre, 'desde', v_plan.desde, 'hasta', v_plan.hasta),
      'hoy', v_hoy,
      'medido_hasta', v_fin,
      'tiendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', u.id, 'nombre', u.nombre, 'erp_desde', a.erp_desde,
                 'unidades', (select coalesce(sum(x.unidades), 0) from vendido x where x.ubicacion_id = u.id and x.fecha >= v_plan.desde),
                 'soles', (select coalesce(round(sum(x.soles), 2), 0) from vendido x where x.ubicacion_id = u.id and x.fecha >= v_plan.desde),
                 'base_unidades', case when a.erp_desde <= v_plan.desde - 60
                                       then (select coalesce(sum(x.unidades), 0) from vendido x where x.ubicacion_id = u.id and x.fecha < v_plan.desde) end)
               order by u.nombre)
          from arranque a join retail.ubicaciones u on u.id = a.ubicacion_id
         where a.erp_desde <= v_fin), '[]'::jsonb),
      'filas', coalesce((
        select jsonb_agg(jsonb_build_object('u', g.ubicacion_id, 'c', g.categoria_id, 'p', g.producto_id, 'color', g.color_codigo,
                                            'unidades', g.unidades, 'soles', g.soles))
          from (select x.ubicacion_id, x.categoria_id, x.producto_id, x.color_codigo, sum(x.unidades)::integer as unidades, round(sum(x.soles), 2) as soles
                  from vendido x where x.fecha >= v_plan.desde group by 1, 2, 3, 4) g), '[]'::jsonb),
      'agotadas', coalesce((select jsonb_agg(jsonb_build_object('u', g.ubicacion_id, 'c', g.categoria_id)) from agotadas g), '[]'::jsonb),
      'despues', jsonb_build_object(
        'hasta', case when v_despues_hasta > v_plan.hasta then v_despues_hasta end,
        'categorias', coalesce((
          select jsonb_agg(jsonb_build_object('c', d.categoria_id, 'unidades', d.unidades, 'soles', d.soles, 'a_precio_lista', d.lista))
            from (select x.categoria_id, sum(x.unidades)::integer as unidades, round(sum(x.soles), 2) as soles, round(sum(x.a_precio_lista), 2) as lista
                    from despues x group by 1) d), '[]'::jsonb)),
      'lineas', coalesce((
        select jsonb_agg(jsonb_build_object('c', l.categoria_id, 'flojo', l.flojo, 'normal', l.normal, 'bueno', l.bueno, 'recupero_pct', l.recupero_pct))
          from retail.planes_compra_lineas l where l.plan_id = v_plan.id), '[]'::jsonb),
      'categorias', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'familia', c.familia, 'prefijo', c.prefijo))
          from retail.categorias c
         where exists (select 1 from vendido x where x.categoria_id = c.id and x.fecha >= v_plan.desde)
            or exists (select 1 from retail.planes_compra_lineas l where l.plan_id = v_plan.id and l.categoria_id = c.id)
            or exists (select 1 from despues x where x.categoria_id = c.id)), '[]'::jsonb),
      'familias', coalesce((select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre) order by f.orden) from retail.familias f), '[]'::jsonb),
      'productos', coalesce((
        select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', coalesce(nullif(btrim(pr.descripcion), ''), pr.referencia, pr.codigo)))
          from retail.productos pr where pr.id in (select x.producto_id from vendido x where x.fecha >= v_plan.desde)), '[]'::jsonb),
      'colores', coalesce((
        select jsonb_agg(jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex))
          from retail.colores co where co.codigo in (select x.color_codigo from vendido x where x.fecha >= v_plan.desde)), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function retail.fn_plan_compra_resultados(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_resultados(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_resultados(uuid) is
  'ADR-0372 (C6): lo vendido en una campaña (hasta ayer) por tienda, categoría, prenda y color; la base de 60 días antes para el multiplicador real de cada tienda; las categorías que quedaron en cero; lo vendido en los 60 días después (a qué % del precio se vendió lo que sobró); y el plan de cada categoría. Pide el módulo plan_compra.';
