-- ============================================================================
-- 20261117141000_transmision_la_escribe_el_servidor.sql — CAYLA V2 (ADR-0675 · 2026-11-17)
--
-- LA REGLA. Lo que SUNAT respondió de un comprobante (enviado, aceptado, rechazado) lo escribe solo el servidor, con la llave de
-- servicio, después de que Lucode respondió: `actualizar_transmision_comprobante` pasa a ser solo de `service_role`. Una sesión
-- de persona —la integrante de la sede o el líder— pide la transmisión, «Reintentar ahora» o el barrido con su sesión (la base
-- sigue decidiendo qué comprobantes ve), pero la escritura final la hace la web con `crearClienteAdmin()`.
--
-- CONTRATO
--   PROMETE: una sesión de persona, líder incluido, no escribe el estado ante SUNAT de un comprobante (42501), y la función no se
--            le da a `public`, `anon` ni `authenticated`. Con la llave de servicio nada cambia: el `for update`, la respuesta vieja
--            que no pisa un aceptado (ADR-0386), los estados que admite y el disparador `comprobantes_estado_no_retrocede`.
--            Idempotente.
--   ASUME:   la definición viva al 2026-11-17 (ancla verificada contra la copia de producción refrescada el 2026-11-16, que solo
--            difiere del repo en un comentario). La web (`lib/transmitir-comprobante.ts`, `lib/resolver-ya-emitido.ts`,
--            `lib/consultar-comprobante.ts`) escribe con el cliente de servicio, que `/api/lucode/emitir` y `/api/lucode/reintentar`
--            crean ANTES de llamar a Lucode; el cron ya entraba con esa llave.
--   NO HACE: no cambia la firma ni lo que guarda; no toca `fn_marcar_reintento_transmision` (solo devuelve a la cola, no escribe
--            una respuesta de SUNAT) ni la baja (`anular_comprobante`, `fn_confirmar_baja_sunat`: ADR-0673).
--
-- DESCARTÉ
--   · Cerrar solo «aceptado» y «rechazado» y dejar «enviado» a la sede: «enviado» saca al comprobante de la cola de reenvío.
--   · Exigir en la base que `p_respuesta_sunat` traiga algo de Lucode: ese JSON lo arma quien llama, no prueba nada.
--
-- SE ROMPE SI
--   · Producción no tiene `SUPABASE_SERVICE_ROLE_KEY`: la web no transmite (503, sin llamar a Lucode) y el comprobante sigue en
--     la cola. Lo mismo le pasa hoy al cron de SUNAT, que ya la necesita.
--   · Se pega ANTES de publicar la web que escribe con la llave: lo que se transmite desde una pantalla queda en SUNAT sin
--     guardarse en el ERP (con su alerta) hasta que el cron lo reenvía, Lucode dice «ya emitido» y lo guarda (ADR-0378).
--     Orden: primero la web, después esto. La web nueva funciona con la base de antes y con esta.
--   · Otra migración cambia estas líneas antes de pegar esto: el ancla no aparece una vez y se detiene sin aplicar nada.
--
-- CÓMO SE PEGA. Una sola parte: un reemplazo anclado y permisos de una función, sin políticas, disparadores ni `alter table`
-- (ADR-0195). Sin `select … into` dentro de un texto entre comillas (ADR-0288). Se puede pegar dos veces. No cruza anclas con
-- ADR-0673 (20261117021000): van en cualquier orden.
-- PRUEBA. `pnpm pruebas:actualizar-transmision-permisos` y las suites de SUNAT (`pruebas:sunat-estado-no-retrocede`,
-- `pruebas:sunat-reintento-por-cron`, `pruebas:anular-venta-comprobante`, `pruebas:notas-credito-serie-por-letra`,
-- `pruebas:comprobante-carne-pasaporte`).
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_0675(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque el texto nuevo podría contener al ancla.
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

-- 1. El estado ante SUNAT lo escribe solo el servidor.
select pg_temp.reemplazar_0675(
  'retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text)',
  $v$  -- PL-113: el trabajo programado (llave de servicio) guarda lo que respondió Lucode, igual que la pantalla.
  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para actualizar ese comprobante';
  end if;
$v$,
  $n$  -- ADR-0675: lo que respondió SUNAT lo escribe solo el servidor (la llave de servicio), después de la respuesta de Lucode.
  -- La pantalla, «Reintentar ahora» y el barrido piden la transmisión con su sesión; la web guarda con `crearClienteAdmin()`.
  if auth.role() is distinct from 'service_role' then
    raise exception 'El estado ante SUNAT lo guarda el servidor cuando Lucode responde' using errcode = '42501';
  end if;
$n$
);

-- 2. Solo la llave de servicio la llama.
revoke execute on function retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text) to service_role;
