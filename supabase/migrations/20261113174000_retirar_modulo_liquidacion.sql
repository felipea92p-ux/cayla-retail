-- ============================================================================
-- 20261113174000_retirar_modulo_liquidacion.sql — CAYLA V2 · ADR-0653 (reemplaza a ADR-0379)
-- Catálogo ▸ Liquidación se retira: sale de Roles y accesos y nadie puede llamar a sus funciones desde la web.
--
-- EL PROBLEMA PRIMERO. Liquidación (ADR-0379, 2026-10-10) etiquetaba prendas sueltas que nunca entraron al catálogo, con un código
-- LQ, para venderlas en la caja. Al 2026-11-12 producción tenía 0 piezas y 0 etiquetas: nunca se usó. Y su nombre se confunde con la
-- insignia «Para liquidar», que sí rebaja prendas del catálogo. Felipe (2026-11-13): «Hay que eliminar la opción o el módulo
-- "liquidacion": nunca se ha usado y solo causa confusión».
--
-- QUÉ HACE (el mismo camino que «Notas de crédito» en 20261022225000, ADR-0480):
--   1. Se detiene si Liquidación tiene historia: una pieza, una etiqueta, una venta con su pieza, una línea en `actividad` o un rol que
--      la tiene de pantalla principal. Así esta migración nunca borra ni deja huérfano nada que alguien hizo.
--   2. Quita sus asignaciones (configuración, no historia: `lider_modulos_ocultos`, `rol_modulos`) y su fila del catálogo `modulos`.
--   3. Le quita a la web el permiso de llamar a las seis funciones que llamaba la pantalla y Vender (`revoke execute`).
--
-- QUÉ NO HACE, A PROPÓSITO.
--   · No borra las tablas (`piezas_liquidacion`, `piezas_liquidacion_etiquetas`, `parametros_liquidacion`) ni las funciones: quedan
--     quietas, documentadas como retiradas. Volver es un `grant` y la fila de `modulos` (ver ADR-0653, «Cómo se vuelve»).
--   · No toca `registrar_venta`. Sus dos reemplazos anclados (`fn_validar_linea_liquidacion`, `fn_vender_pieza_liquidacion`) solo se
--     activan con una línea que trae `pieza_liquidacion_codigo`, que la web ya no manda; si alguien la mandara a mano, la etiqueta no
--     existe y la venta se rechaza (`liquidacion_no_existe`). Reescribir esa función para quitarle dos ramas muertas arriesga
--     las ventas de las tres tiendas a cambio de nada.
--   · No toca los disparadores `trg_cambios_liquidacion_venta_final`, `trg_devolucion_items_liquidacion_venta_final` ni
--     `trg_piezas_liquidacion_al_anular`: sin piezas, nunca encuentran nada que frenar.
--
-- ESTADO QUE DEJA DE SER POSIBLE: que alguien vea «Liquidación» en Roles y accesos sin pantalla detrás, o que una cuenta etiquete una
-- pieza llamando a la función directo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: DESPUÉS de publicar la web de este cambio (la web de hoy pide el módulo y llama a estas funciones), tal
-- cual en el SQL Editor y SOLO con el OK de Felipe. Sin políticas, sin `drop trigger` y sin `alter` de tablas: ADR-0195 no aplica.
-- Re-pegable: los `delete` no encuentran nada la segunda vez y el `revoke` no falla si ya no hay permiso.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if exists (select 1 from retail.piezas_liquidacion)
     or exists (select 1 from retail.piezas_liquidacion_etiquetas)
     or exists (select 1 from retail.actividad where modulo = 'liquidacion')
     or exists (select 1 from retail.roles where pantalla_principal = 'liquidacion') then
    raise exception 'Liquidación tiene historia (piezas, etiquetas, actividad o la pantalla principal de un rol): no se retira'
      using errcode = 'P0001', hint = 'liquidacion_con_historia';
  end if;
end $$;

-- 2. Fuera del catálogo y de los roles.
delete from retail.lider_modulos_ocultos where modulo in ('liquidacion');
delete from retail.rol_modulos where modulo in ('liquidacion');
delete from retail.modulos where clave in ('liquidacion');

-- 3. La web ya no las llama; sin permiso, tampoco puede una llamada a mano. Las demás (las internas de registrar_venta y los
--    disparadores) ya no estaban abiertas a `authenticated`, o solo corren al dispararse.
revoke execute on function retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid, text) from public, anon, authenticated;
revoke execute on function retail.cambiar_precio_pieza_liquidacion(text, numeric) from public, anon, authenticated;
revoke execute on function retail.retirar_pieza_liquidacion(text, text) from public, anon, authenticated;
revoke execute on function retail.guardar_precio_minimo_liquidacion(numeric) from public, anon, authenticated;
revoke execute on function retail.fn_pieza_liquidacion(text) from public, anon, authenticated;
revoke execute on function retail.fn_piezas_liquidacion(uuid) from public, anon, authenticated;

comment on table retail.piezas_liquidacion is
  'RETIRADA (ADR-0653, 2026-11-13): Catálogo ▸ Liquidación se retiró sin haberse usado. La tabla queda vacía y sin pantalla; sus funciones no las puede llamar la web. Antes: ADR-0379.';
comment on table retail.piezas_liquidacion_etiquetas is
  'RETIRADA (ADR-0653, 2026-11-13): las etiquetas LQ de Liquidación, que se retiró sin haberse usado. Antes: ADR-0379.';
comment on table retail.parametros_liquidacion is
  'RETIRADA (ADR-0653, 2026-11-13): el precio mínimo de Liquidación, que se retiró sin haberse usado. Antes: ADR-0379.';

notify pgrst, 'reload schema';
