-- ============================================================================
-- 20261009121000_tienda_revisa_apertura_y_arregla_danada.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-10-09): dos acciones de tienda que solo hacía un líder pasan a quien
-- ve el módulo donde vive su botón (ADR-0161 / ADR-0306), igual que «Anular venta» en
-- 20261009120000:
--
-- 1. «Marcar como revisada» una apertura de caja que no cuadró con el cierre anterior
--    (`revisar_apertura_caja`, ADR-0186). Su botón vive en Caja ▸ Historial. Pasa a
--    `fn_puede_gestionar_caja()` —el mismo permiso que ya cierra la caja: líder o quien tiene
--    el módulo Caja— y se AGREGA el candado de sede que antes no hacía falta (un líder ve
--    todas): `fn_puede_operar_ubicacion` de la sede de la caja. No mueve plata: el motivo
--    de la diferencia lo escribió quien abrió y queda; el efectivo se corrige con un
--    movimiento de caja, como siempre. Quién la revisó queda firmado (`apertura_revisada_por`).
--
-- 2. «Se arregló» una prenda dañada (`arreglar_prenda_danada`): vuelve de cuarentena al
--    almacén de la MISMA sede. Su botón vive en Existencias. Pasa a
--    `fn_ve_modulo('existencias')`. El candado de sede ya lo pone `mover_interno`
--    (`fn_puede_operar_ubicacion`). Liquidar, botar, donar o devolver al proveedor
--    (`resolver_prenda_danada`, `liquidar_prenda_danada`) SIGUEN siendo solo del líder:
--    esas sacan stock sin venta.
--
-- CÓMO. Las dos se parchan en vivo con un ancla que debe aparecer exactamente una vez; se
-- puede pegar dos veces. No toca tablas ni políticas (ADR-0195) ni hay `select … into` en
-- texto entre comillas (ADR-0288).
--
-- Huellas verificadas ANTES (2026-10-09), iguales en local y en producción:
--   md5(pg_get_functiondef('retail.revisar_apertura_caja(uuid)'::regprocedure))            = 8680fb0524143a092ccab00b0bb50b89
--   md5(pg_get_functiondef('retail.arreglar_prenda_danada(uuid,text,uuid)'::regprocedure)) = a04ba4690098905c68149fe1a5175ef0
--
-- CÓMO SE DESHACE: el mismo reemplazo al revés (volver a `if not fn_es_lider() then` con su
-- mensaje original, que está en el texto de cada `pg_temp.reemplazar` de abajo).
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'tienda revisa apertura y arregla dañada: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Revisar una apertura: quien gestiona la caja, solo la de su sede.
select pg_temp.reemplazar(
  'retail.revisar_apertura_caja(uuid)',
  E'if not fn_es_lider() then\n    raise exception ''Solo un líder de equipo puede dar por revisada una apertura'' using errcode = ''42501'';\n  end if;',
  E'if not fn_puede_gestionar_caja() then\n    raise exception ''Para revisar una apertura necesitas el módulo Caja'' using errcode = ''42501'';\n  end if;'
    || E'\n  if not fn_puede_operar_ubicacion((select c.ubicacion_id from cajas c where c.id = p_caja_id)) then'
    || E'\n    raise exception ''Esa caja es de otra sede: solo revisas las aperturas de la tuya'' using errcode = ''42501'';'
    || E'\n  end if;',
  1
);

-- 2. Arreglar una prenda dañada: quien ve Existencias.
select pg_temp.reemplazar(
  'retail.arreglar_prenda_danada(uuid, text, uuid)',
  E'-- La decisión de devolver una prenda a la venta es del líder (como Liquidada, Se botó y Donada).\n  if not fn_es_lider() then\n    raise exception ''Solo un líder decide que una prenda dañada se arregló y vuelve a la venta.'' using hint = ''arreglo_solo_lider'';',
  E'-- Devolver a la venta una prenda arreglada lo hace quien ve Existencias (Felipe 2026-10-09); liquidar, botar y donar siguen del líder.\n  if not fn_ve_modulo(''existencias'') then\n    raise exception ''Para devolver a la venta una prenda arreglada necesitas el módulo Existencias.'' using hint = ''arreglo_sin_modulo'';',
  1
);

-- Validación: ningún candado de líder quedó y los nuevos están una sola vez.
do $v$
declare
  v_ap text := pg_get_functiondef('retail.revisar_apertura_caja(uuid)'::regprocedure);
  v_ar text := pg_get_functiondef('retail.arreglar_prenda_danada(uuid, text, uuid)'::regprocedure);
begin
  if position('fn_es_lider()' in v_ap) > 0 or position('fn_puede_operar_ubicacion(' in v_ap) = 0 then
    raise exception 'tienda revisa apertura: el candado no quedó como se esperaba';
  end if;
  if position('arreglo_solo_lider' in v_ar) > 0 or position('fn_ve_modulo(''existencias'')' in v_ar) = 0 then
    raise exception 'tienda arregla dañada: el candado no quedó como se esperaba';
  end if;
end;
$v$;
