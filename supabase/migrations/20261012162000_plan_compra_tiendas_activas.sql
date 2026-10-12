-- Plan de campaña: el Historial y los Resultados muestran SIEMPRE las tiendas activas (ADR-0372, act. 2026-10-12 · Felipe: «quiero ver
-- Arequipa, Lima y Trujillo, que son mis tiendas activas»).
--
-- EL PROBLEMA. `fn_historial_ventas` y `fn_plan_compra_resultados` listaban solo las tiendas con algún dato (historia de Sinatra o una venta
-- en el ERP). Lima no tiene ninguna de las dos todavía (su Sinatra 2026 son 20 registros sueltos de «Ingresos», no un diario, y aún no vende
-- en el ERP), así que desaparecía de las dos pantallas: una tienda activa que no sale parece que no existe. Ahora toda tienda activa sale,
-- con «Sin dato» o 0 donde no hay nada; una tienda inactiva con historia sigue saliendo (su historia no se borra).
--
-- QUÉ CAMBIA. Dos reemplazos ANCLADOS por función (el texto vivo se cambia solo en esas líneas; si no calza, falla sin tocar nada). Sin
-- tablas, sin políticas ni `drop trigger` (ADR-0195). Idempotente.

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

-- Historial: toda tienda activa, tenga o no historia.
select pg_temp.reemplazar(
  'retail.fn_historial_ventas(date,date)',
  $v$where exists (select 1 from dias d where d.ubicacion_id = u.id)$v$,
  $v$where (u.tipo = 'tienda' and u.activo) or exists (select 1 from dias d where d.ubicacion_id = u.id)$v$,
  1);

-- Resultados: toda tienda activa (con 0 si no vendió), no solo las que ya venden en el ERP.
select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$from arranque a join retail.ubicaciones u on u.id = a.ubicacion_id$v$,
  $v$from retail.ubicaciones u left join arranque a on a.ubicacion_id = u.id$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_plan_compra_resultados(uuid)',
  $v$where a.erp_desde <= v_fin), '[]'::jsonb),$v$,
  $v$where (u.tipo = 'tienda' and u.activo) or a.erp_desde <= v_fin), '[]'::jsonb),$v$,
  1);
