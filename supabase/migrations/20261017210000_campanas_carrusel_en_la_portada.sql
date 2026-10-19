-- Tienda web ▸ Campañas (ADR-0436, actividad 6b): cuando corre más de una campaña, la portada las muestra en carrusel.
--
-- EL PROBLEMA. LA regla de la portada (`fn_campana_en_portada`) elige UNA campaña por día: con Halloween y el Día del Gato a la vez, una
-- de las dos nunca se veía. Felipe (2026-10-17), al preguntarle cómo se elegía a mano cuál va primero: «si hay dos campañas activas, eso
-- debe convertirse en un carrusel que va deslizándose cada ciertos segundos».
--
-- LO QUE HACE.
-- 1. `fn_campanas_en_portada(dia)`: TODAS las campañas que salen ese día, en orden (la regla de 20261017204000, sin el `limit 1`): primero
--    las de descuento, después la que termina primero, la de mayor descuento y el nombre. Es LA regla: `fn_campana_en_portada(dia)` pasa a
--    ser su primera, para no tener dos.
-- 2. `tienda_portada()` suma `campanas` (todas, en orden, con la misma forma) y mantiene `campana` (la primera): una tienda que todavía no se
--    publicó con el carrusel sigue mostrando la primera, como hoy.
-- 3. `campanas_portada_dias` suma `campanas` por día (y mantiene `campana`, la primera): el ERP dibuja los días en carrusel.
--
-- QUÉ NO CAMBIA. Cuál es la primera: la misma de antes (lo comprueba el final). El descuento que cobra la caja no se toca.
--
-- ORDEN. Va después de 20261017204000. Volver a pegar 20261017144000 o 20261017204000 después de esta deja la regla de UNA campaña en
-- `fn_campana_en_portada` (la tienda muestra solo la primera, sin romperse) hasta volver a pegar esta.
--
-- Funciones, sin tablas ni políticas: se pega de una vez (idempotente).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

select set_config('campanas.portada_antes', retail.tienda_portada()::text, false);

-- 1. LA regla, como lista ------------------------------------------------------------------------------------------------------

create or replace function retail.fn_campanas_en_portada(p_dia date)
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    array_agg(e.id order by coalesce(e.descuento_pct, 0) > 0 desc, e.vigente_hasta nulls last, e.descuento_pct desc nulls last, e.nombre),
    '{}'::uuid[]
  )
  from retail.etiquetas e
  where e.estilo = 'campana'
    and e.estado = 'aprobado'
    and e.activo
    and (e.vigente_desde is null or e.vigente_desde <= p_dia)
    and (e.vigente_hasta is null or e.vigente_hasta >= p_dia)
    and (
      exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
      or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
      -- Sin descuento, también con solo su diseño (Felipe, decisión 2).
      or (coalesce(e.descuento_pct, 0) = 0
          and exists (select 1 from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado'))
    );
$$;

comment on function retail.fn_campanas_en_portada(date) is
  'Tienda web ▸ Campañas (ADR-0436): LA regla de qué campañas anuncia la portada de la tienda online un día dado, en orden (vacío = ninguna): aprobadas, activas, vigentes, con prendas o categorías (o, sin descuento, con su diseño publicado); primero las de descuento, luego la que termina primero, la de mayor descuento y el nombre. Con más de una, la tienda las pasa en carrusel. Interna.';

revoke all on function retail.fn_campanas_en_portada(date) from public, anon, authenticated;

-- La primera de la lista: lo que leían la tienda y el ERP antes del carrusel. Una sola regla.
create or replace function retail.fn_campana_en_portada(p_dia date)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select (retail.fn_campanas_en_portada(p_dia))[1]; $$;

comment on function retail.fn_campana_en_portada(date) is
  'Tienda web ▸ Campañas (ADR-0436): la primera de fn_campanas_en_portada (null = ninguna). Interna.';

revoke all on function retail.fn_campana_en_portada(date) from public, anon, authenticated;

-- 2. Lo que lee la tienda --------------------------------------------------------------------------------------------------------

-- {campana: la primera | null, campanas: [{id, nombre, pct (null sin descuento), hasta, diseno, prendas: [producto_id]}] en orden}.
create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  with lista as (
    select x.id, x.n from unnest(retail.fn_campanas_en_portada(retail.fn_hoy_lima())) with ordinality as x(id, n)
  ),
  fichas as (
    select l.n, jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'pct', e.descuento_pct,
        'hasta', e.vigente_hasta,
        'diseno', (select retail.fn_diseno_json(d) from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado'),
        'prendas', retail.fn_modelos_de_campana(e.id)
      ) as ficha
    from lista l
    join retail.etiquetas e on e.id = l.id
  )
  select jsonb_build_object(
    'campana', (select f.ficha from fichas f where f.n = 1),
    'campanas', coalesce((select jsonb_agg(f.ficha order by f.n) from fichas f), '[]'::jsonb)
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: la primera | null, campanas: [{id, nombre, pct (null sin descuento), hasta, diseno (el publicado | null), prendas: [producto_id] (hasta 200)}] en orden}. Cuáles, lo decide fn_campanas_en_portada (ADR-0436); con más de una, carrusel. Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;

-- 3. Día por día, para el ERP -----------------------------------------------------------------------------------------------------

create or replace function retail.campanas_portada_dias(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de días no es válido.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dia', x.dia, 'campana', x.ids[1], 'campanas', to_jsonb(x.ids)) order by x.dia)
    from (
      select d::date as dia, retail.fn_campanas_en_portada(d::date) as ids
      from generate_series(p_desde, p_hasta, interval '1 day') d
    ) x
  ), '[]'::jsonb);
end;
$$;

comment on function retail.campanas_portada_dias(date, date) is
  'Tienda web ▸ Campañas (ADR-0436): [{dia, campana (la primera | null), campanas: [id] en orden}] por cada día del rango (máx. 400), con la regla de fn_campanas_en_portada. Pide fn_puede_campanas().';

revoke all on function retail.campanas_portada_dias(date, date) from public, anon;
grant execute on function retail.campanas_portada_dias(date, date) to authenticated, service_role;

-- 4. Comprobación: la primera es la de antes, y la lista empieza por ella.
do $$
declare
  v_antes jsonb := nullif(current_setting('campanas.portada_antes', true), '')::jsonb;
  v_ahora jsonb := retail.tienda_portada();
begin
  if v_antes is null then
    raise exception 'campanas_carrusel: no se pudo leer la portada de antes';
  end if;
  if (v_ahora -> 'campana' ->> 'nombre') is distinct from (v_antes -> 'campana' ->> 'nombre') then
    raise exception 'campanas_carrusel: la portada anunciaba primero «%» y ahora «%»', v_antes -> 'campana' ->> 'nombre', v_ahora -> 'campana' ->> 'nombre';
  end if;
  if (v_ahora -> 'campanas' -> 0) is distinct from (case when v_ahora -> 'campana' = 'null'::jsonb then null else v_ahora -> 'campana' end) then
    raise exception 'campanas_carrusel: la lista no empieza por la campaña de la portada';
  end if;
end $$;

reset lock_timeout;
