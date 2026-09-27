-- ============================================================================
-- 20260928120100_bajadas_nucleo.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 2 de Frescura 3c · PARTE 1 de 2
-- Separa el cálculo de las bajadas de su candado. REFACTOR PURO: mismas filas, mismos errores, mismo candado.
--
-- EL PROBLEMA PRIMERO. `fn_bajadas_del_piso` hace dos cosas pegadas: decide QUIÉN puede mirar (hoy solo el líder) y
-- CALCULA qué bajadas al piso fueron tardías. El paso 3 de Frescura necesita el cálculo desde otras dos lecturas
-- (`fn_frescura_sede`, que verá quien tenga el módulo Frescura en su sede, y `fn_confianza_registro`), cada una con su
-- propio candado. Con el cálculo pegado al candado de líder solo quedan dos salidas malas: copiar el cálculo (dos
-- versiones de «qué es una bajada tardía» que se separan con el primer arreglo) o aflojar el candado de todos a la vez.
--
-- QUÉ HACE.
--   · `retail.fn_bajadas_del_piso_nucleo(...)`: el cuerpo de hoy de `fn_bajadas_del_piso`
--     (20260926000300_frescura_lectura_bajadas.sql) letra por letra, SIN el candado de líder. Interna: nadie de afuera
--     la ejecuta (`revoke` a public, anon y authenticated); la llaman funciones `security definer` que ya decidieron
--     quién mira.
--   · `retail.fn_bajadas_del_piso(...)`: la misma firma, las mismas columnas y el MISMO candado de hoy (solo el líder,
--     con el mismo texto y la misma pista `bajadas_solo_lider`), y después le pide todo al núcleo. El candado va antes
--     que las validaciones de la ventana y el rango, igual que hoy: a quien no es líder le sigue saliendo el candado.
-- No cambia ningún resultado. El cambio de conducta (netear retiros, `corregida`, carga inicial) es la PARTE 2
-- (20260928120200), aparte a propósito: si algo se mueve aquí, es un error de este archivo y no una decisión.
--
-- LA ANALOGÍA. Es la llave del almacén de la tienda: hoy la tiene solo el líder y además es el único que sabe contar el
-- fardo. Se separa quién tiene la llave de cómo se cuenta: el conteo es uno solo, y cada puerta decide a quién le abre.
-- Mal hecho sería darle a cada puerta su propio cuaderno de conteo.
--
-- LA GUARDA. Reescribir el cuerpo borraría en silencio un parche en vivo (pasó con el PR 397), así que solo sigue si
-- el cuerpo vivo de `fn_bajadas_del_piso` es uno de estos (md5 de `prosrc`):
--   · 91e2d0c19981952706c7b75d8514eb26 — el de 20260926000300. Medido IGUAL en producción (consulta de solo lectura del
--     2026-09-27) y en una base armada desde el repo: el mismo código, sin diferencias de comentarios.
--   · 34a7e0cc5f421333761e8bda92a582eb — esta misma migración ya pegada (el envoltorio de abajo): se puede volver a pegar.
-- Con cualquier otro, aborta sin tocar nada. Buscado antes de escribir: ninguna migración posterior a la 000300 la
-- recrea ni la parcha con `reemplazar_vivo`.
-- Si ya se pegó la PARTE 2, esta aborta con un aviso: la PARTE 2 ya trae el núcleo, y volver a esta la desharía.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora, ANTES de la
-- 20260928120200. Solo `create or replace function` con la misma firma, comentarios, `revoke` y `grant`: no toma
-- candados de tablas en uso, no lleva políticas ni `drop trigger` (ADR-0195). Re-ejecutable.
-- Cómo se verifica después: `select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and
-- proname like 'fn_bajadas_del_piso%';` da dos filas, y la del envoltorio mide 34a7e0cc5f421333761e8bda92a582eb.
--
-- SE ROMPE SI alguien le da EXECUTE del núcleo a `authenticated` (cualquier cuenta leería las bajadas de cualquier
-- sede, con quién las hizo), o si una lectura nueva llama al núcleo sin decidir antes su propio candado.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.fn_ledger_puntos(uuid, timestamptz, uuid[])') is null
     or to_regprocedure('retail.fn_es_traslado_interno(text, uuid, uuid)') is null then
    raise exception 'Falta fn_ledger_puntos o fn_es_traslado_interno: pega antes 20260924030000_ledger_fuente_unica.sql (ADR-0202)';
  end if;
  if to_regclass('retail.bajada_piso_items') is null or to_regclass('retail.prendas_por_regularizar') is null then
    raise exception 'Falta bajada_piso_items o prendas_por_regularizar: pega antes 20260926000100 y 20260923161700';
  end if;
  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_bajadas_del_piso_nucleo'
       and 'cantidad_efectiva' = any(p.proargnames)
  ) then
    raise exception 'Ya está pegada la 20260928120200 (el núcleo ya netea retiros): esta parte no hace falta, y volver a pegarla la desharía.';
  end if;
  select md5(p.prosrc) into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_bajadas_del_piso: pega antes 20260926000300_frescura_lectura_bajadas.sql';
  end if;
  if v_md5 not in ('91e2d0c19981952706c7b75d8514eb26', '34a7e0cc5f421333761e8bda92a582eb') then
    raise exception 'fn_bajadas_del_piso cambió desde que se escribió esta migración (md5 del cuerpo: %, se esperaba 91e2d0c19981952706c7b75d8514eb26). Alguien la parchó en vivo: reescribe el núcleo desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. El núcleo: el cálculo de hoy, sin candado (interno)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_bajadas_del_piso_nucleo(
  p_ubicacion_id uuid,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_minutos integer default 10
)
returns table (
  movimiento_id uuid,
  bajada_id uuid,
  variante_id uuid,
  persona_id uuid,
  bajada_en timestamptz,
  cantidad integer,
  piso_antes integer,
  vendidas_en_ventana integer,
  unidades_tardias integer,
  cerrada boolean,
  estado text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_piso uuid;
  v_alm uuid;
  v_ventana interval;
  v_desde timestamptz := coalesce(p_desde, now() - interval '30 days');
  v_hasta timestamptz := least(coalesce(p_hasta, now()), now());
begin
  if p_minutos is null or p_minutos not between 1 and 240 then
    raise exception 'La ventana va de 1 a 240 minutos.';
  end if;
  -- El libro se lee desde p_desde hasta AHORA (no hasta p_hasta): el costo lo fija la distancia a hoy.
  if v_desde < now() - interval '120 days' then
    raise exception 'El rango máximo es de 120 días.';
  end if;
  v_ventana := make_interval(mins => p_minutos);

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_alm from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  -- Taller, tienda que aún no separa piso y almacén, o tienda inactiva (el libro no la reconstruye): no hay bajadas
  -- que leer, y no es un error.
  if v_piso is null or v_alm is null or v_hasta <= v_desde
     or not exists (select 1 from ubicaciones u where u.id = p_ubicacion_id and u.activo) then
    return;
  end if;

  return query
  with bajadas as (
    select m.id, m.variante_id, m.usuario_id, m.created_at as t, m.cantidad
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
       and m.sububicacion_id = v_alm
       and m.sububicacion_destino_id = v_piso
       and m.created_at >= v_desde and m.created_at < v_hasta
       and m.variante_id <> c_centinela
  ),
  piso as (
    -- UNA llamada con todas las prendas de las bajadas. Sin bajadas va un arreglo vacío, nunca nulo: nulo le pide al
    -- libro TODAS las prendas de la tienda.
    select pt.oid, pt.variante_id, pt.delta, pt.nivel, pt.es_venta
      from fn_ledger_puntos(p_ubicacion_id, v_desde,
                            (select coalesce(array_agg(distinct b.variante_id), '{}'::uuid[]) from bajadas b)) pt
     where pt.bucket = 'piso' and pt.ord = 1
  ),
  ventas_piso as materialized (
    -- En el cubo del piso, delta negativo = la salida fue DEL piso (una venta desde el almacén no deja punto aquí).
    select p.variante_id, coalesce(ve.created_at, m.created_at) as t_venta, (-p.delta)::integer as cantidad
      from piso p
      join movimientos m on m.id = p.oid
      left join venta_items vi on vi.id = m.venta_item_id
      left join ventas ve on ve.id = vi.venta_id
     where p.es_venta and p.delta < 0
       and not exists (select 1 from prendas_por_regularizar pr where pr.venta_item_id = m.venta_item_id)
  ),
  vendidas as (
    select b.id, coalesce(sum(vp.cantidad), 0)::integer as n
      from bajadas b
      left join ventas_piso vp on vp.variante_id = b.variante_id and vp.t_venta >= b.t and vp.t_venta <= b.t + v_ventana
     group by b.id
  ),
  antes as (
    -- Toda bajada tiene su punto: suma cantidad (> 0 por constraint) al piso de una tienda activa.
    select b.id, (p.nivel - p.delta)::integer as piso_antes
      from bajadas b
      join piso p on p.oid = b.id
  )
  select b.id, i.bajada_id, b.variante_id, b.usuario_id, b.t, b.cantidad, a.piso_antes, v.n,
         case when a.piso_antes < 0 then null else least(b.cantidad, greatest(0, v.n - a.piso_antes))::integer end,
         (b.t + v_ventana <= now()),
         case when a.piso_antes < 0 then 'dudosa'
              when least(b.cantidad, greatest(0, v.n - a.piso_antes)) > 0 then 'tardia'
              when b.t + v_ventana > now() then 'en_curso'
              else 'normal' end
    from bajadas b
    join antes a on a.id = b.id
    join vendidas v on v.id = b.id
    left join bajada_piso_items i on i.movimiento_id = b.id
   order by b.t desc, b.id;
end
$fn$;

comment on function retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208 (paso 2 de Frescura 3c): el cálculo de fn_bajadas_del_piso SIN candado. Una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana y las unidades tardías. Interna: no se otorga a nadie; la llaman funciones security definer que ya decidieron quién mira (hoy fn_bajadas_del_piso, solo líder).';

revoke all on function retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La puerta de hoy: el mismo candado, y el cálculo se lo pide al núcleo
-- ----------------------------------------------------------------------------

create or replace function retail.fn_bajadas_del_piso(
  p_ubicacion_id uuid,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_minutos integer default 10
)
returns table (
  movimiento_id uuid,
  bajada_id uuid,
  variante_id uuid,
  persona_id uuid,
  bajada_en timestamptz,
  cantidad integer,
  piso_antes integer,
  vendidas_en_ventana integer,
  unidades_tardias integer,
  cerrada boolean,
  estado text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
begin
  if not fn_es_lider() then
    raise exception 'Solo el líder puede ver cómo se registran las bajadas al piso.' using hint = 'bajadas_solo_lider';
  end if;
  return query select * from fn_bajadas_del_piso_nucleo(p_ubicacion_id, p_desde, p_hasta, p_minutos);
end
$fn$;

comment on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208: una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana y las unidades tardías (registradas al cobrar, no al colgar). Derivado al leer; solo líder. Estado dudosa = stock y libro no cuadran. Desde el paso 2 de Frescura 3c es la puerta con candado de retail.fn_bajadas_del_piso_nucleo, que hace el cálculo encima de retail.fn_ledger_puntos (ADR-0202).';

revoke all on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
