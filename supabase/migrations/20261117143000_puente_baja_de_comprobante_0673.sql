-- ============================================================================
-- 20261117143000 — PUENTE: lo que ADR-0673 (#1918) dejó en producción, traído a ADR-0671 (#1912) para que este se fusione primero
--
-- EL PROBLEMA. ADR-0671 (#1912, los comprobantes de un cambio) y ADR-0673 (#1918, la baja la pide su sede y la confirma el servidor)
--   cambian `anular_comprobante`, y los dos se pegaron en producción el 2026-11-17: primero ADR-0673 (`20261117021000`), después las tres
--   partes de ADR-0671. Producción tiene la suma; el CI de cada PR, solo lo suyo. El check «SQL pegado» de cada uno ve en producción el
--   cambio del otro y ninguno pasa (ADR-0251, «Dos PR pegan sobre la misma función»; pasó con #1655 y #1658). Felipe eligió el 2026-11-17
--   que #1912 se fusione primero, con este puente.
--
-- LO QUE HACE. Trae, con el mismo texto, lo que ADR-0673 dejó en producción:
--   1. `anular_comprobante` exige operar la sede del comprobante (`fn_puede_operar_ubicacion`). Va ANTES de «¿está aceptado?» y no justo
--      después de «no existe»: así queda donde está en producción, detrás del candado de ADR-0671 (la huella mira el orden del código).
--   2. `anular_comprobante` solo PIDE la baja: ya no escribe «anulado» (`p_confirmada` sigue en la firma y no cambia el estado).
--   3. `fn_confirmar_baja_sunat` la confirma solo el servidor (la llave de servicio), y solo él la puede llamar.
--   Y los comentarios de las dos funciones, iguales a los de producción.
-- EN PRODUCCIÓN NO HACE NADA: cada reemplazo se reconoce ya puesto por su comentario «ADR-0673: …» y vuelve sin tocar la función; el
--   `revoke`, el `grant` y los `comment` dejan lo que ya hay. Comprobado el 2026-11-17 contra el texto exacto de producción.
-- CUANDO #1918 SE FUSIONE. Su migración (`20261117021000`) tiene versión anterior a esta: en una base nueva corre antes y esta no hace
--   nada. Para que esa base termine igual que producción, su primer reemplazo tiene que anclar también antes de «¿está aceptado?» (hoy
--   ancla justo después de «no existe» y quedaría ANTES del candado de ADR-0671); se le pidió a #1918 el 2026-11-17.
-- SE ROMPE SI: alguien cambia en `main` las líneas donde anclan estos reemplazos antes de que este entre: el ancla aparece 0 veces y la
--   migración se detiene sin aplicar nada (mejor que adivinar).
-- CÓMO SE PEGA. No hace falta: producción ya lo tiene. Si se pega, no cambia nada. Sin políticas, disparadores ni `alter` (ADR-0195).
--   `lock_timeout` 3 s. Idempotente.
-- PRUEBA. `pnpm pruebas:anular-venta-comprobante` (la confirmación la escribe el servidor) y `pnpm pruebas:cambio-con-comprobantes`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.puente_0673(p_firma text, p_marca text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_firma::regprocedure);
  v_n integer;
begin
  -- Ya puesto (por ADR-0673 o por este puente): su comentario está. Se mira la marca y no el bloque entero, porque otra migración
  -- puede escribir en medio (ADR-0671 lo hizo con su candado).
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió este puente: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La baja es de la sede del comprobante.
select pg_temp.puente_0673(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
  '-- ADR-0673: pedir la baja es de quien opera la tienda del comprobante',
  $v$  if v_comp.estado <> 'aceptado' then
$v$,
  $n$  -- ADR-0673: pedir la baja es de quien opera la tienda del comprobante, como toda operación de una sede.
  if not fn_puede_operar_ubicacion(v_comp.ubicacion_id) then
    raise exception 'Este comprobante es de otra tienda: pide la baja desde una cuenta de esa tienda' using errcode = '42501';
  end if;
  if v_comp.estado <> 'aceptado' then
$n$
);

-- 2. Aquí solo se PIDE la baja.
select pg_temp.puente_0673(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
  '-- ADR-0673: esto solo PIDE la baja',
  $v$    anulado_por = v_persona,
    estado = case when p_confirmada then 'anulado' else estado end,
    anulado_at = case when p_confirmada then now() else anulado_at end
$v$,
  $n$    anulado_por = v_persona
    -- ADR-0673: esto solo PIDE la baja. «Anulado» lo escribe fn_confirmar_baja_sunat, con la llave del servidor, cuando SUNAT
    -- la confirmó; p_confirmada sigue en la firma para no romper a quien la llama, y ya no cambia el estado.
$n$
);

-- 3. La confirmación es solo del servidor.
select pg_temp.puente_0673(
  'retail.fn_confirmar_baja_sunat(uuid, jsonb)',
  '-- ADR-0673: confirma solo el servidor',
  $v$  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para operar ese comprobante';
  end if;
$v$,
  $n$  -- ADR-0673: confirma solo el servidor (la llave de servicio), después de que Lucode dijo que SUNAT confirmó la baja.
  if auth.role() is distinct from 'service_role' then
    raise exception 'La baja la confirma el servidor cuando SUNAT responde' using errcode = '42501';
  end if;
$n$
);

revoke execute on function retail.fn_confirmar_baja_sunat(uuid, jsonb) from public, anon, authenticated;
grant execute on function retail.fn_confirmar_baja_sunat(uuid, jsonb) to service_role;

comment on function retail.anular_comprobante(uuid, text, boolean, jsonb) is
  'Pide la baja de un comprobante aceptado (Facturación + la sede del comprobante). No escribe «anulado»: eso es de fn_confirmar_baja_sunat. ADR-0673.';
comment on function retail.fn_confirmar_baja_sunat(uuid, jsonb) is
  'Marca «anulado» un comprobante cuya baja YA PEDIDA confirmó SUNAT. Solo la llave de servicio (el servidor, tras la respuesta de Lucode). 20261007200000, ADR-0673.';
