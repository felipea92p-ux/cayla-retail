-- ============================================================================
-- 20261111165000 — Una compra unida a su recepción «sin aviso» ya no sale como «por enviar» (ADR-0636, act. 2026-11-11 b)
--
-- EL PROBLEMA PRIMERO. El 2026-11-11 se unieron en producción OC-000008 (Jirish, 15) y OC-000018 (Lady Girl, 17) con la recepción ENV-007: sus
-- envíos de Compras quedaron anulados y sus papeles pasaron al libro. Pero en Recibir siguieron saliendo como «Sin guía · Llegó esta orden» (Felipe:
-- «¿por qué siguen apareciendo estas 2?»). La unión (20261110011000) le enseñó a `fn_compra_item_por_mandar` y al tope de `despacho_items` que esa
-- compra ya llegó —por eso nadie puede volver a enviarla ni recibirla: «Llegó esta orden» se negaría con `compra_ya_llego`—, pero tres lecturas
-- calculan «lo que falta mandar» por su cuenta, contando solo los envíos, y al anularse el envío volvieron a ver la orden entera por mandar:
--   · `fn_ordenes_directas_por_recibir` — Recibir, «Sin guía · Llegó esta orden» (la de la captura).
--   · `fn_ordenes_compra_por_enviar`    — Órdenes de compra, lo que falta mandar a tienda.
--   · `fn_analisis_pedido_en_camino`    — Análisis, lo pedido que todavía no llega (contaba 32 prendas «en camino» que ya están en la tienda).
--
-- LA DECISIÓN. Una orden cuya compra (papel) está unida a una recepción ya llegó entera (la unión exige que haya llegado todo): esas tres lecturas
-- la dejan fuera. Un solo agregado, igual en las tres, junto al filtro `o.estado = 'generada'` que ya tienen.
-- QUÉ NO CAMBIA. Stock, movimientos, dinero ni ninguna función que escribe. `fn_plan_compra_pedido` (Plan de campaña) tampoco: ahí la orden debe
--   seguir saliendo como pedida; que cuente 0 «por llegar» queda anotado en el backlog.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin políticas ni `alter table` (ADR-0195). Va después de 20261110011000 (la tabla de uniones).
--   Si una función cambió y el ancla no aparece exactamente una vez, ABORTA sin cambiar nada. Las tres son `security definer`: leen la tabla
--   de uniones aunque `authenticated` no tenga permiso sobre ella.
-- VERIFICACIÓN (solo lectura): las tres llevan 'compra_papel_llegadas cpl' en su definición. (`fn_analisis_pedido_en_camino` no tiene migración en
--   el repo: existe solo en producción; en una base local se salta.)
-- CÓMO SE DESHACE: volver a pegar la definición anterior de cada una (quitar el agregado).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.sin_unidas(p_firma text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_viejo constant text := 'o.estado = ''generada''';
  v_nuevo constant text := 'o.estado = ''generada'' and not exists (select 1 from retail.compra_papel_llegadas cpl where cpl.papel_id = o.papel_id) /* ADR-0636: ya llegó por una recepción unida */';
  v_n integer;
begin
  -- `fn_analisis_pedido_en_camino` vive en producción sin migración en el repo (se creó a mano): en una base local no existe y se salta.
  if to_regprocedure(p_firma) is null then
    raise notice '% no existe en esta base: se salta', p_firma;
    return;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position('compra_papel_llegadas cpl' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_n <> 1 then
    raise exception '% cambió (el filtro de órdenes vigentes aparece % veces): no se reemplaza. Regenera esta migración desde su definición real.', p_firma, v_n;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$f$;

select pg_temp.sin_unidas('retail.fn_ordenes_directas_por_recibir(uuid)');
select pg_temp.sin_unidas('retail.fn_ordenes_compra_por_enviar()');
select pg_temp.sin_unidas('retail.fn_analisis_pedido_en_camino(uuid)');

do $comprueba$
declare
  v text;
begin
  foreach v in array array['retail.fn_ordenes_directas_por_recibir(uuid)', 'retail.fn_ordenes_compra_por_enviar()', 'retail.fn_analisis_pedido_en_camino(uuid)'] loop
    if to_regprocedure(v) is not null and position('compra_papel_llegadas cpl' in pg_get_functiondef(v::regprocedure)) = 0 then
      raise exception 'La migración 20261111165000 no quedó aplicada en %: revisa antes de seguir.', v;
    end if;
  end loop;
end $comprueba$;

reset lock_timeout;
