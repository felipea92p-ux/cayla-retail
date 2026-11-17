-- ============================================================================
-- 20261117021000_baja_de_comprobante_sede_y_servidor.sql — CAYLA V2 (ADR-0673 · 2026-11-17)
--
-- LA REGLA. Anular un comprobante es irreversible ante SUNAT, y un comprobante es de una sede.
--   · Pedir la baja (`anular_comprobante`) es de quien ve Facturación EN LA SEDE del comprobante (`fn_puede_operar_ubicacion`),
--     como toda operación de una sede (ADR-0534 puso el módulo; esto suma la sede).
--   · «Anulado» lo escribe solo el servidor, con la llave de servicio, cuando Lucode dice que SUNAT confirmó la baja
--     (`fn_confirmar_baja_sunat`, solo `service_role`). `anular_comprobante` anota el pedido y nada más; su `p_confirmada` sigue en
--     la firma para no romper a quien la llama, y ya no cambia el estado.
--
-- CONTRATO
--   PROMETE: una cuenta que no opera la sede del comprobante no pide su baja (42501). Una sesión de persona —líder incluido— no
--            deja un comprobante «anulado»: lo hace `fn_confirmar_baja_sunat` con la llave de servicio, que no confirma una baja que
--            nadie pidió. Nada más cambia: estados, notas vigentes, motivo y firma del responsable se validan igual. Idempotente.
--   ASUME:   las definiciones vivas al 2026-11-17 (anclas verificadas contra la copia de producción refrescada el 2026-11-16).
--            La web (`/api/lucode/anular`, `/api/lucode/consultar-anulacion`, `lib/consultar-comprobante.ts`) confirma con
--            `crearClienteAdmin()` después de la respuesta de Lucode; el cron de `/api/lucode/reintentar` ya entra con esa llave.
--   NO HACE: no toca la baja de un comprobante ya pedida ni ya anulada; no cambia firmas (PostgREST y las anclas de ADR-0671 siguen
--            valiendo); no toca `actualizar_transmision_comprobante`.
--
-- DESCARTÉ
--   · Exigir en la base que `p_respuesta` traiga la confirmación de Lucode: ese JSON lo arma quien llama, no prueba nada.
--   · Rechazar `p_confirmada = true` con un error: una web publicada antes que esta migración quedaría con la baja pedida a SUNAT y
--     sin guardar. Ignorarlo deja la baja en trámite y el barrido del cron la confirma al preguntarle a Lucode.
--   · Que también el PEDIDO pase por la llave de servicio: cambia la firma (choca con ADR-0671) y la firma del responsable sale de la
--     sesión de quien pide; pedir una baja sin confirmarla no cambia nada ante SUNAT.
--
-- SE ROMPE SI
--   · Producción no tiene `SUPABASE_SERVICE_ROLE_KEY`: la baja queda en trámite hasta que alguien la configure (lo mismo le pasa al
--     cron de SUNAT, que ya la necesita).
--   · Otra migración cambia estas líneas antes de pegar esto: el ancla no aparece una vez y se detiene sin aplicar nada.
--
-- CÓMO SE PEGA. Una sola parte: reemplazos anclados de funciones y permisos de una función, sin políticas, disparadores ni
-- `alter table` (ADR-0195). Sin `select … into` dentro de un texto entre comillas (ADR-0288). Se puede pegar dos veces.
-- En una base nueva corre DESPUÉS de las partes de ADR-0671 (20261116213000) y deja el candado de sede detrás de su bloqueo, como
-- en producción. En producción no hace nada: ya está pegada (cada reemplazo se reconoce puesto).
-- PRUEBA. `pnpm pruebas:anular-comprobante-permisos` y `pnpm pruebas:anular-venta-comprobante`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_0673(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque el texto nuevo puede contener al ancla.
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

-- 1. La baja es de la sede del comprobante. Ancla en «¿está aceptado?» y no justo después de «no existe»: así queda detrás del
--    bloqueo de ADR-0671 (20261116213000, que corre antes en una base nueva), en el mismo lugar que en producción y que el puente
--    20261117143000 (la huella de «SQL pegado» mira el orden del código).
select pg_temp.reemplazar_0673(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
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
select pg_temp.reemplazar_0673(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
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
select pg_temp.reemplazar_0673(
  'retail.fn_confirmar_baja_sunat(uuid, jsonb)',
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
