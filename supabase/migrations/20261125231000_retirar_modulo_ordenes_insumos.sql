-- ============================================================================
-- 20261125231000_retirar_modulo_ordenes_insumos.sql — CAYLA V2 · ADR-0702 (retira la fase 7 de ADR-0362)
-- Producción ▸ Abastecimiento ▸ «Órdenes de insumos» se retira: sale de Roles y accesos y la web ya no puede llamar a sus funciones.
--
-- EL PROBLEMA PRIMERO. La orden de insumos (ADR-0362 fase 7, 2026-10-13) pedía la tela antes de que llegara: pedir → factura → recibir →
-- pagar. Al 2026-11-25 producción tenía 0 órdenes. Las 9 facturas del Taller nacieron por otro lado: 8 de corte y ploteo en Por pagar ▸
-- «Pagar servicio» y 1 de tela en Insumos ▸ «Llegó una compra», que factura y recibe en un paso. Felipe (2026-11-25): «eliminemos los
-- otros módulos que no se usan». Con la orden se va también el «Recibir» del Taller (web), que solo recibía contra una orden o una
-- factura suelta: «Llegó una compra» ya recibe sola.
--
-- QUÉ HACE (el mismo camino que Liquidación en 20261113174000, ADR-0653):
--   1. Se detiene si la orden de insumos tiene historia: una orden, una línea en `actividad` del módulo o un rol que la tiene de pantalla
--      principal. Así esta migración nunca deja huérfano nada que alguien hizo.
--   2. Quita sus asignaciones (configuración, no historia: `lider_modulos_ocultos`, `rol_modulos`) y su fila del catálogo `modulos`.
--   3. `fn_ordenes_insumo_nos_debe` (la lee Facturas de insumos, Por pagar y Finanzas para el aviso de faltantes) pedía el módulo que se va:
--      sin esta línea, el aviso se perdería en silencio. Pasa a pedir el de Producción, que ya piden esas pantallas. Reescrita desde
--      pg_get_functiondef de PRODUCCIÓN (md5 156f1c0198107698f65d0fe649db7c6c, 2026-11-25): mismo cuerpo, mismo nombre, misma firma.
--   4. Le quita a la web el permiso de llamar a las nueve funciones que llamaba solo la pantalla (`revoke execute`).
--
-- QUÉ NO HACE, A PROPÓSITO.
--   · No borra las tablas (`ordenes_insumo` y sus cuatro hijas) ni las funciones: quedan quietas, documentadas como retiradas. Volver es un
--     `grant`, la fila de `modulos` y el código de la web (ADR-0702, «Cómo se vuelve»).
--   · No toca `recibir_comprobante_produccion` ni `registrar_comprobante_produccion`: los usa «Llegó una compra» y «Pagar servicio».
--   · No toca `fn_ordenes_insumo_por_recibir` ni `fn_orden_insumo_por_recibir_lineas`: son lecturas que piden el módulo de Producción y,
--     sin órdenes, devuelven vacío.
--
-- ESTADO QUE DEJA DE SER POSIBLE: que alguien vea «Órdenes de insumos» en Roles y accesos sin pantalla detrás, o que una cuenta cree una
-- orden llamando a la función directo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: DESPUÉS de publicar la web de este cambio (la web de hoy pide el módulo y llama a estas funciones), tal cual
-- en el SQL Editor y SOLO con el OK de Felipe. Sin políticas, sin `drop trigger` y sin `alter` de tablas: ADR-0195 no aplica. Re-pegable:
-- los `delete` no encuentran nada la segunda vez, el `create or replace` deja lo mismo y el `revoke` no falla si ya no hay permiso.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if exists (select 1 from retail.ordenes_insumo)
     or exists (select 1 from retail.actividad where modulo = 'ordenes_insumos')
     or exists (select 1 from retail.roles where pantalla_principal = 'ordenes_insumos') then
    raise exception 'Órdenes de insumos tiene historia (órdenes, actividad o la pantalla principal de un rol): no se retira'
      using errcode = 'P0001', hint = 'ordenes_insumos_con_historia';
  end if;
end $$;

-- 2. Fuera del catálogo y de los roles.
delete from retail.lider_modulos_ocultos where modulo in ('ordenes_insumos');
delete from retail.rol_modulos where modulo in ('ordenes_insumos');
delete from retail.modulos where clave in ('ordenes_insumos');

-- 3. El aviso de faltantes pide el módulo de Producción (antes: 'ordenes_insumos').
CREATE OR REPLACE FUNCTION retail.fn_ordenes_insumo_nos_debe(p_ids uuid[])
 RETURNS TABLE(orden_id uuid, cierres integer, nos_debe numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Ver lo que debe un proveedor del Taller necesita el módulo «Producción» en tu rol'
      using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  if cardinality(coalesce(p_ids, '{}'::uuid[])) > 200 then
    raise exception 'Se preguntan 200 órdenes como máximo' using errcode = 'P0001';
  end if;
  return query
  select k.orden_insumo_id, count(*)::integer, sum(round(k.cantidad * k.costo_unitario, 2))::numeric
    from retail.orden_insumo_cierres k
   where k.orden_insumo_id = any (coalesce(p_ids, '{}'::uuid[]))
   group by k.orden_insumo_id;
end;
$function$;

-- 4. La web ya no las llama; sin permiso, tampoco puede una llamada a mano.
revoke execute on function retail.crear_orden_insumo(uuid, uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke execute on function retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke execute on function retail.anular_orden_insumo(uuid, integer, text) from public, anon, authenticated;
revoke execute on function retail.fn_ordenes_insumo(text, uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function retail.fn_orden_insumo(uuid) from public, anon, authenticated;
revoke execute on function retail.fn_orden_insumo_opciones() from public, anon, authenticated;
revoke execute on function retail.fn_ordenes_insumo_siguiente() from public, anon, authenticated;
revoke execute on function retail.registrar_comprobante_orden_insumo(uuid, text, text, text, jsonb, date, text, date, numeric, numeric, jsonb, text, uuid)
  from public, anon, authenticated;
revoke execute on function retail.recibir_orden_insumo(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;

comment on table retail.ordenes_insumo is
  'RETIRADA (ADR-0702, 2026-11-25): Órdenes de insumos se retiró sin haberse usado (0 órdenes). La tabla queda vacía y sin pantalla; sus funciones no las puede llamar la web. Antes: ADR-0362 fase 7.';
comment on table retail.orden_insumo_items is
  'RETIRADA (ADR-0702, 2026-11-25): las líneas de Órdenes de insumos, que se retiró sin haberse usado. Antes: ADR-0362 fase 7.';
comment on table retail.orden_insumo_recepciones is
  'RETIRADA (ADR-0702, 2026-11-25): lo recibido contra una orden de insumos, que se retiró sin haberse usado. Antes: ADR-0362 fase 7.';
comment on table retail.orden_insumo_cierres is
  'RETIRADA (ADR-0702, 2026-11-25): los cierres de lo que no llegó de una orden de insumos, que se retiró sin haberse usado. Antes: ADR-0362 fase 7.';
comment on table retail.orden_insumo_versiones is
  'RETIRADA (ADR-0702, 2026-11-25): las versiones de una orden de insumos, que se retiró sin haberse usado. Antes: ADR-0362 fase 7.';

notify pgrst, 'reload schema';
