-- ============================================================================
-- 20261015023000_pedidos_web_cierre_programado.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 7: el cierre de las 24 h
--
-- EL PROBLEMA PRIMERO. Un pedido que nadie confirma se cierra solo pasado su plazo (decisión de Felipe: 24 horas corridas;
-- el plazo vive en Configuración ▸ Tienda web y se puede cambiar de 1 a 168 h). El motor (20261014235000) ya trae
-- `fn_cerrar_pedidos_web_vencidos(horas)`, que cierra lo vencido, y ya LEE vencido lo que pasó su plazo aunque nadie lo haya
-- cerrado (nadie lo puede confirmar). Falta quién lo llame y con qué plazo: la ruta programada del ERP
-- (`apps/web/app/api/pedidos-web/cerrar-vencidos/route.ts`, `vercel.json`, ADR-0408 DECIDÍ 8, como las demás: sin `pg_cron`).
--
-- QUÉ HACE. `fn_cerrar_pedidos_web_sin_confirmar()`: lee el plazo de `configuracion_tienda_web` y llama a
-- `fn_cerrar_pedidos_web_vencidos` con él, en la misma transacción. Devuelve {cerrados, horas_para_confirmar}. Solo la ejecuta
-- `service_role` (la llave de servicio de la ruta).
--
-- DECIDÍ: leer el plazo AQUÍ y no en la ruta. Así la ruta no puede pasar un número escrito a mano, y la lectura del cliente
--   («se cierra en…», `tienda_mis_pedidos`) y el cierre usan siempre la misma fila. Si la fila faltara, falla con su hint
--   (`tienda_web_sin_plazos`) y la ruta lo registra: nunca cierra con un plazo inventado.
-- DESCARTÉ: que la ruta lea la tabla con la llave de servicio (depende de los permisos de tabla de producción, que no se ven
--   desde aquí) y cambiar la firma de `fn_cerrar_pedidos_web_vencidos` (es del motor, y la usa su prueba).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261014231000 y 20261014235000. Una sola
-- función; se pega entera y se puede volver a pegar. Prueba: `pnpm pruebas:tienda-bolsa`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_cerrar_pedidos_web_sin_confirmar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_horas integer;
begin
  select c.horas_para_confirmar into v_horas from retail.configuracion_tienda_web c where c.id;
  if v_horas is null then
    raise exception 'Faltan los plazos de la tienda web (Configuración ▸ Tienda web).' using errcode = 'P0001', hint = 'tienda_web_sin_plazos';
  end if;
  return jsonb_build_object('cerrados', retail.fn_cerrar_pedidos_web_vencidos(v_horas), 'horas_para_confirmar', v_horas);
end;
$fn$;

comment on function retail.fn_cerrar_pedidos_web_sin_confirmar() is
  'Pedidos web (ADR-0408, act. 7): la ruta programada cierra lo que nadie confirmó en el plazo de Configuración ▸ Tienda web (fn_cerrar_pedidos_web_vencidos). {cerrados, horas_para_confirmar}. Solo service_role.';

revoke all on function retail.fn_cerrar_pedidos_web_sin_confirmar() from public, anon, authenticated;
grant execute on function retail.fn_cerrar_pedidos_web_sin_confirmar() to service_role;

reset lock_timeout;
