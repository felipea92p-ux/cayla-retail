-- ============================================================================
-- 20261105232000_tope_de_corte_tres_prendas.sql — CAYLA V2 (Felipe, 2026-10-16; ADR-0614, actividad 8)
-- Cortar de más: hasta 3 prendas por talla y color, no un 10 %
--
-- EL PROBLEMA PRIMERO. La base dejaba cortar hasta el plan más un 10 %. Felipe contestó el 16-oct (P-22 y N-3) que el margen se dice en prendas, «hasta 3 por talla», y nunca se
-- construyó. Con un 10 %, un plan de 200 por talla dejaba cortar 20 de más sin avisar; y un plan de 5 solo dejaba cortar 1.
--
-- CONTRATO. `fn_produccion_entrada_variante` responde el plan + 3 en la primera fase que cuenta prendas; las demás fases siguen tomando lo que salió de la anterior. No cambia lo ya
-- anotado: una orden que cortó de más antes de esto se queda como está, y solo se rechaza lo que se anote después si pasa el tope nuevo.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: una función. Se puede pegar antes o después de publicar la web, que lee el tope de la base.
-- VERIFICACIÓN: select position('+ 3' in pg_get_functiondef('retail.fn_produccion_entrada_variante'::regproc)) > 0;  → t
-- CÓMO SE DESHACE: volver a `ceil(v_plan * 1.10)`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_produccion_entrada_variante(p_fase_id uuid, p_variante_id uuid)
returns integer
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare v_produccion uuid; v_clave text; v_anterior uuid; v_plan integer;
begin
  select f.produccion_id, f.clave into v_produccion, v_clave from retail.produccion_fases f where f.id = p_fase_id;
  if v_produccion is null then return 0; end if;
  -- Una fase que se marca (Ploteo) no cuenta prendas: nada «entra» a ella.
  if retail.fn_fase_es_hito(v_clave) then return 0; end if;
  v_anterior := retail.fn_produccion_fase_anterior(p_fase_id);
  if v_anterior is null then
    select l.cantidad_plan into v_plan from retail.produccion_lineas l where l.produccion_id = v_produccion and l.variante_id = p_variante_id;
    -- Cortar de más: hasta 3 por talla y color (P-22 y N-3, Felipe 2026-10-16). Sin línea en la orden, nada.
    return coalesce(v_plan + 3, 0)::integer;
  end if;
  return coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_anterior and a.variante_id = p_variante_id), 0)::integer;
end;
$$;

reset lock_timeout;
