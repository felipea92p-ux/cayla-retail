-- Tienda web ▸ Campañas (ADR-0436, actividad 6a): una campaña sin descuento también sale en la portada de la tienda online.
--
-- EL PROBLEMA. LA regla de la portada (`fn_campana_en_portada`, 20261017144000) solo anuncia campañas con descuento: Halloween, Navidad
-- o Black Friday sin descuento nunca salen, por más lindo que sea su diseño. Felipe (decisión 2, 2026-10-17): «una campaña sin descuento
-- sale en la portada si tiene prendas o diseño propio; con dos a la vez, la de descuento primero».
--
-- LO QUE HACE.
-- 1. `fn_campana_en_portada(dia)`: sale la campaña aprobada, activa y vigente ese día que tenga prendas o categorías (como antes) o,
--    si no tiene descuento, su diseño publicado. Primero las que tienen descuento; después, como siempre, la que termina primero, la de
--    mayor descuento y el nombre. Una campaña CON descuento pero sin prendas sigue sin salir: anunciaría «−N % en prendas elegidas» sin
--    ninguna.
-- 2. `tienda_portada()` suma el `id` de la campaña y `prendas`: los modelos que lleva (a mano o por sus categorías, hasta 200), para que
--    la tienda muestre los de una campaña sin descuento (que no bajan de precio y no salen en «Ofertas») y arme su lista. `pct` puede
--    llegar null.
--
-- QUÉ NO CAMBIA. Si hoy sale una campaña con descuento, sale la misma (lo comprueba el final). El descuento que cobra la caja no se toca:
-- esto solo decide qué anuncia la portada.
--
-- ORDEN. Va después de 20261017200000 (y de 20261017144000 y 20261017160000). Una tienda que todavía no se publicó con la actividad 6a
-- no sabe leer una campaña sin descuento: la descarta y la portada sale sin campaña, como hoy cuando no hay ninguna con descuento.
--
-- Funciones, sin tablas ni políticas: se pega de una vez (idempotente).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que la tienda ve HOY, para comprobar al final.
select set_config('campanas.portada_antes', retail.tienda_portada()::text, false);

-- 1. LA regla --------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_campana_en_portada(p_dia date)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id
  from retail.etiquetas e
  where e.estilo = 'campana'
    and e.estado = 'aprobado'
    and e.activo
    and (e.vigente_desde is null or e.vigente_desde <= p_dia)
    and (e.vigente_hasta is null or e.vigente_hasta >= p_dia)
    and (
      exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
      or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
      -- Sin descuento, también con solo su diseño (Felipe, decisión 2): se anuncia aunque todavía no tenga prendas.
      or (coalesce(e.descuento_pct, 0) = 0
          and exists (select 1 from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado'))
    )
  order by coalesce(e.descuento_pct, 0) > 0 desc, e.vigente_hasta nulls last, e.descuento_pct desc nulls last, e.nombre
  limit 1;
$$;

comment on function retail.fn_campana_en_portada(date) is
  'Tienda web ▸ Campañas (ADR-0436): LA regla de qué campaña anuncia la portada de la tienda online un día dado (null = ninguna): aprobada, activa, vigente, con prendas o categorías (o, sin descuento, con su diseño publicado); primero las de descuento, luego la que termina primero, la de mayor descuento y el nombre. La leen tienda_portada() y campanas_portada_dias(). Interna.';

revoke all on function retail.fn_campana_en_portada(date) from public, anon, authenticated;

-- 2. Lo que lee la tienda --------------------------------------------------------------------------------------------------------

-- Los modelos de una campaña: los que lleva a mano y los de sus categorías, sin los descontinuados (qué se ve lo decide la tienda). Hasta 200 (la portada usa tres y la lista de la
-- campaña, todos; una campaña de CAYLA lleva decenas).
create or replace function retail.fn_modelos_de_campana(p_etiqueta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb)
  from (
    select distinct p.id
    from retail.productos p
    where p.estado <> 'descontinuado'
      and (
        p.id in (select v.producto_id from retail.variante_etiquetas ve join retail.variantes v on v.id = ve.variante_id where ve.etiqueta_id = p_etiqueta_id)
        or p.categoria_id in (select ec.categoria_id from retail.etiqueta_categorias ec where ec.etiqueta_id = p_etiqueta_id)
      )
    order by p.id
    limit 200
  ) x;
$$;

revoke all on function retail.fn_modelos_de_campana(uuid) from public, anon, authenticated;

-- {campana: {id, nombre, pct (null sin descuento), hasta, diseno, prendas: [producto_id]} | null}.
create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'pct', e.descuento_pct,
        'hasta', e.vigente_hasta,
        'diseno', (select retail.fn_diseno_json(d) from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado'),
        'prendas', retail.fn_modelos_de_campana(e.id)
      )
      from retail.etiquetas e
      where e.id = retail.fn_campana_en_portada(retail.fn_hoy_lima())
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {id, nombre, pct (null sin descuento), hasta, diseno (el publicado | null), prendas: [producto_id] (hasta 200)} | null}. Cuál, lo decide fn_campana_en_portada (ADR-0436). Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;

-- 3. Comprobación: si hoy salía una campaña (con descuento: la regla de antes las pedía), sale la misma.
do $$
declare
  v_antes jsonb := nullif(current_setting('campanas.portada_antes', true), '')::jsonb;
  v_ahora jsonb := retail.tienda_portada();
begin
  if v_antes is null then
    raise exception 'campanas_sin_descuento: no se pudo leer la portada de antes';
  end if;
  if v_antes -> 'campana' <> 'null'::jsonb
     and (v_ahora -> 'campana' ->> 'nombre') is distinct from (v_antes -> 'campana' ->> 'nombre') then
    raise exception 'campanas_sin_descuento: la portada anunciaba «%» y ahora «%»', v_antes -> 'campana' ->> 'nombre', v_ahora -> 'campana' ->> 'nombre';
  end if;
  if v_ahora -> 'campana' <> 'null'::jsonb and not (v_ahora -> 'campana' ? 'prendas' and v_ahora -> 'campana' ? 'id') then
    raise exception 'campanas_sin_descuento: la campaña de la portada no trae su id y sus prendas';
  end if;
end $$;

reset lock_timeout;
