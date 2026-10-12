-- Plan de campaña ▸ Resultados: «¿Cómo va?» y «Pedir más o impulsar» de UNA tienda (ADR-0372, act. 2026-10-12 (c)).
--
-- EL PROBLEMA. Al tocar la tarjeta de una tienda, la tabla de categorías se filtraba a ella, pero «¿Cómo va?» y «Pedir más o impulsar»
-- seguían hablando de toda CAYLA (Felipe: «al seleccionar una tienda, ¿no debería mostrar lo suyo, y Toda CAYLA el global?»). No había con
-- qué: la lectura mandaba lo vendido por día y el stock por categoría sumando todas las sedes.
--
-- QUÉ SUMA a `fn_plan_compra_resultados` (claves nuevas; las de antes no cambian):
--   · `por_dia_tienda`: unidades vendidas cada día de la campaña, por tienda (la curva de «¿Cómo va?» de esa tienda).
--   · `stock_tienda`: por categoría y sede, lo que hay HOY y lo que había al cerrar lo medido (sin Cuarentena), para «alcanza para» de esa
--     tienda. Solo las categorías vendidas o con plan, como `stock`.
-- La parte del plan que le toca a cada tienda NO va aquí: sale de la regla del reparto (`lib/plan-compra-reparto.ts`), la misma del Plan.
--
-- CÓMO SE PEGA: un reemplazo ANCLADO sobre el texto vivo (si no calza, falla sin tocar nada). Sin tablas, políticas ni `drop trigger`.
-- Solo lee.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$      'productos', coalesce(($v$,
  $v$      'por_dia_tienda', coalesce((
        select jsonb_agg(jsonb_build_object('f', d.fecha, 't', d.ubicacion_id, 'u', d.u) order by d.fecha)
          from (select x.fecha, x.ubicacion_id, sum(x.unidades)::integer as u from vendido x where x.fecha >= v_plan.desde group by 1, 2) d), '[]'::jsonb),
      'stock_tienda', coalesce((
        select jsonb_agg(jsonb_build_object('c', k.categoria_id, 't', k.ubicacion_id, 'hoy', coalesce(h.unidades, 0), 'cierre', coalesce(z.unidades, 0)))
          from (select s.ubicacion_id, s.categoria_id from retail.fn_stock_categoria_al(now()) s
                union select s.ubicacion_id, s.categoria_id from retail.fn_stock_categoria_al(((v_fin + 1)::timestamp at time zone tz)) s) k
          left join retail.fn_stock_categoria_al(now()) h on h.ubicacion_id = k.ubicacion_id and h.categoria_id = k.categoria_id
          left join retail.fn_stock_categoria_al(((v_fin + 1)::timestamp at time zone tz)) z on z.ubicacion_id = k.ubicacion_id and z.categoria_id = k.categoria_id
         where k.categoria_id in (select x.categoria_id from vendido x where x.fecha >= v_plan.desde
                                  union select l.categoria_id from retail.planes_compra_lineas l where l.plan_id = v_plan.id)), '[]'::jsonb),
      'productos', coalesce(($v$,
  1);
