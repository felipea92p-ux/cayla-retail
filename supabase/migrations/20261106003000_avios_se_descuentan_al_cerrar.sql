-- ============================================================================
-- 20261106003000_avios_se_descuentan_al_cerrar.sql — CAYLA V2 (Felipe, 2026-10-29, ADR-0570; ADR-0614, actividad 13)
-- Los avíos que declara una orden se descuentan solos al pasarla al stock
--
-- EL PROBLEMA PRIMERO. Una orden declara sus avíos (botones, cierres), pero salen del estante solo si alguien anota «cuánto quedó», y nadie lo hace: en producción, las órdenes cerraron con los
-- botones declarados y sin descontar. El estante decía tener botones que ya estaban cosidos, y el costo de la prenda salía sin ellos.
--
-- LA DECISIÓN. Al cerrar, por cada avío declarado se calcula lo que debió usarse (cantidad por prenda × prendas buenas de ese color, o de toda la orden) y se descuenta lo que falte, el lote más
-- antiguo primero, antes de calcular el costo. ADR-0570 decía «al terminar el paso que los usa», pero la base no sabe qué paso usa cada avío; al cerrar, el estante y el costo quedan igual de bien.
-- Si no alcanza, descuenta lo que hay, no frena y lo deja escrito en la nota: la prenda ya está hecha, y frenarla por un dato de botones es peor que un aviso.
--
-- CONTRATO (Liskov)
--   PROMETE: después de cerrar, el consumo neto de cada avío declarado es al menos lo calculado, si había con qué. Volver a cerrar tras revertir no descuenta dos veces.
--   ASUME:   lo llama `cerrar_produccion`, con la orden bloqueada. Un avío en unidades enteras se redondea hacia arriba.
--   NO HACE: no toca la tela: esa se mide con «cuánto quedó» (ADR-0570). No devuelve al revertir: lo cosido sigue cosido; anular sí devuelve, como siempre.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: dos funciones. Sin políticas ni `alter`. Se puede pegar antes o después de publicar la web.
-- VERIFICACIÓN: select position('fn_descontar_avios_al_cerrar' in pg_get_functiondef(p.oid)) > 0 from pg_proc p where p.pronamespace='retail'::regnamespace and p.proname='cerrar_produccion';  → t
-- CÓMO SE DESHACE: el reemplazo al revés y `drop function retail.fn_descontar_avios_al_cerrar(uuid)`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_descontar_avios_al_cerrar(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_a record;
  v_debe numeric;
  v_ya numeric;
  v_hay numeric;
  v_toma numeric;
  v_faltan text[] := '{}';
begin
  v_ubicacion := (select p.ubicacion_id from retail.producciones p where p.id = p_produccion_id);
  for v_a in
    select pi.insumo_id, i.nombre, i.unidad_medida, sum(
             pi.consumo_por_prenda * coalesce((
               select sum(l.cantidad_buenas) from retail.produccion_lineas l join retail.variantes v on v.id = l.variante_id
                where l.produccion_id = p_produccion_id and (pi.color_codigo is null or v.color_codigo = pi.color_codigo)), 0)) as debe
      from retail.produccion_insumos pi
      join retail.insumos i on i.id = pi.insumo_id and i.tipo = 'avio'
     where pi.produccion_id = p_produccion_id
     group by pi.insumo_id, i.nombre, i.unidad_medida
     order by pi.insumo_id
  loop
    v_debe := case when v_a.unidad_medida in ('unidad', 'cono', 'par', 'docena') then ceil(v_a.debe) else round(v_a.debe, 3) end;
    v_ya := coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) from retail.movimientos_insumo mi
                       where mi.produccion_id = p_produccion_id and mi.insumo_id = v_a.insumo_id and mi.tipo in ('consumo', 'devolucion')), 0);
    if v_debe <= v_ya then
      continue;
    end if;
    -- Un candado por (avío, sede), como la tela (ADR-0587): dos cierres a la vez no leen el mismo saldo.
    perform pg_advisory_xact_lock(hashtextextended('insumo:' || v_a.insumo_id::text || ':' || v_ubicacion::text, 0));
    v_hay := coalesce((
      select sum(l.cantidad_ingresada
                 - coalesce((select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo in ('consumo', 'merma')), 0)
                 + coalesce((select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo = 'devolucion'), 0))
        from retail.insumo_lotes l where l.insumo_id = v_a.insumo_id and l.ubicacion_id = v_ubicacion), 0);
    v_toma := least(v_debe - v_ya, greatest(v_hay, 0));
    if v_a.unidad_medida in ('unidad', 'cono', 'par', 'docena') then
      v_toma := floor(v_toma);
    end if;
    if v_toma > 0 then
      perform retail.fn_insumo_consumir_peps(p_produccion_id, v_a.insumo_id, v_ubicacion, v_toma, 'Se descontó solo al pasar al stock', v_actor);
    end if;
    if v_toma < v_debe - v_ya then
      v_faltan := v_faltan || (v_a.nombre || ' (' || trim_scale(v_debe - v_ya - v_toma) || ')');
    end if;
  end loop;
  if cardinality(v_faltan) > 0 then
    update retail.producciones p set nota = concat_ws(' · ', nullif(p.nota, ''), 'No alcanzó el estante para: ' || array_to_string(v_faltan, ', ')) where p.id = p_produccion_id;
  end if;
  perform retail.fn_recalcular_costo_insumos_produccion(p_produccion_id);
end;
$$;

revoke all on function retail.fn_descontar_avios_al_cerrar(uuid) from public, anon, authenticated;

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Después de validar las buenas y antes de calcular el costo, para que el costo de la orden ya incluya los avíos.
do $$
begin
  perform pg_temp.reemplazar_anclado(
    (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'cerrar_produccion'),
    $v$  perform retail.fn_produccion_exigir_ya_registrada(p_produccion_id);$v$,
    $n$  perform retail.fn_produccion_exigir_ya_registrada(p_produccion_id);
  perform retail.fn_descontar_avios_al_cerrar(p_produccion_id);$n$);
end;
$$;

reset lock_timeout;
