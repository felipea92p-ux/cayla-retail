-- Plan de campaña ▸ Resultados: lo que necesitan «¿Cómo va?», «Pedir más o impulsar» y el cierre con sell-through (ADR-0372, act. 2026-10-12).
--
-- EL PROBLEMA. Resultados decía cuánto se vendió por categoría, pero no CUÁNDO (para comparar el ritmo con el plan día a día y proyectar el
-- cierre), ni cuánto QUEDA (para decir si alcanza hasta el fin de la campaña), ni cuánto se vendió CON REBAJA (para separar lo vendido a
-- precio lleno de lo rebajado y de lo que sobró). Esta migración suma esas cuatro cosas a la lectura; las reglas viven en la web
-- (`lib/plan-compra-resultados.ts`, con su prueba).
--
-- QUÉ SUMA a `fn_plan_compra_resultados` (claves nuevas; las de antes no cambian, la web de antes las ignora):
--   · `por_dia`: unidades vendidas cada día de la campaña (toda CAYLA), para «¿Cómo va?».
--   · `filas[].rebajadas`: de esas unidades, cuántas se cobraron por debajo de su precio de etiqueta.
--   · `stock`: por categoría, lo que hay HOY y lo que había al cerrar lo medido (sin Cuarentena; todas las sedes, Taller incluido: lo del
--     Taller se puede mandar a una tienda). Solo de las categorías vendidas o con plan.
--
-- CÓMO SE PEGA: reemplazos ANCLADOS sobre el texto vivo (si no calza, falla sin tocar nada). Sin tablas, políticas ni `drop trigger`.

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

-- Las unidades cobradas por debajo de su precio de etiqueta, en cada fila (prenda × color × tienda).
select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$select x.ubicacion_id, x.categoria_id, x.producto_id, x.color_codigo, sum(x.unidades)::integer as unidades, round(sum(x.soles), 2) as soles$v$,
  $v$select x.ubicacion_id, x.categoria_id, x.producto_id, x.color_codigo, sum(x.unidades)::integer as unidades, round(sum(x.soles), 2) as soles, (coalesce(sum(x.unidades) filter (where x.soles < x.a_precio_lista - 0.005), 0))::integer as rebajadas$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$'unidades', g.unidades, 'soles', g.soles))$v$,
  $v$'unidades', g.unidades, 'soles', g.soles, 'rebajadas', g.rebajadas))$v$,
  1);

-- Lo vendido por día y el stock de hoy y al cierre, por categoría.
select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$'familias', coalesce((select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre) order by f.orden) from retail.familias f), '[]'::jsonb),$v$,
  $v$'familias', coalesce((select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre) order by f.orden) from retail.familias f), '[]'::jsonb),
      'por_dia', coalesce((
        select jsonb_agg(jsonb_build_object('f', d.fecha, 'u', d.u) order by d.fecha)
          from (select x.fecha, sum(x.unidades)::integer as u from vendido x where x.fecha >= v_plan.desde group by 1) d), '[]'::jsonb),
      'stock', coalesce((
        select jsonb_agg(jsonb_build_object('c', k.categoria_id, 'hoy', coalesce(h.u, 0), 'cierre', coalesce(z.u, 0)))
          from (select x.categoria_id from vendido x where x.fecha >= v_plan.desde
                union select l.categoria_id from retail.planes_compra_lineas l where l.plan_id = v_plan.id) k
          left join (select s.categoria_id, sum(s.unidades)::integer as u from retail.fn_stock_categoria_al(now()) s group by 1) h on h.categoria_id = k.categoria_id
          left join (select s.categoria_id, sum(s.unidades)::integer as u from retail.fn_stock_categoria_al(((v_fin + 1)::timestamp at time zone tz)) s group by 1) z on z.categoria_id = k.categoria_id), '[]'::jsonb),$v$,
  1);
