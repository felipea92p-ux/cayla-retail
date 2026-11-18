#!/usr/bin/env node
/**
 * Quién escribe lo que respondió SUNAT de un comprobante.
 *
 * LA REGLA. El estado de un comprobante ante SUNAT (enviado, aceptado, rechazado) lo escribe solo el servidor, con la llave
 * de servicio, después de que Lucode respondió (`actualizar_transmision_comprobante`, solo `service_role`). Una sesión de
 * persona —la integrante de la sede o el líder— lo pide (transmitir, «Reintentar ahora», el barrido), pero no lo escribe.
 *
 * QUÉ PRUEBA.
 *   1. La integrante de la sede del comprobante no escribe «aceptado», «rechazado» ni «enviado» con su sesión (42501), y el
 *      comprobante no cambia.
 *   2. El líder tampoco (42501).
 *   3. La llave de servicio sí: queda con el estado, el ambiente y la respuesta de Lucode.
 *   4. Con la llave de servicio sigue valiendo lo de antes: una respuesta vieja no pisa un aceptado (ADR-0386), un estado que
 *      no es de esta función se rechaza y un comprobante que no existe da error.
 *   5. `actualizar_transmision_comprobante` no se le da a `authenticated` ni a `anon`.
 *
 * CÓMO. Como `anular_venta_comprobante.mjs`: `docker exec ... psql`, `set_config('request.jwt.claim.sub', …)` para ser cada cuenta
 * de la semilla, `request.jwt.claim.role = 'service_role'` para ser el servidor, y una sola transacción que termina SIEMPRE en
 * ROLLBACK. Los comprobantes se emiten con la RPC real (`emitir_comprobante`).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se revierte).
 *
 * USO
 *   pnpm pruebas:actualizar-transmision-permisos    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas cuentas que supabase/seed.sql.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo: no es líder

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${String(resultado).slice(0, 900).replace(/\n/g, "\n    ")}`);
  }
}

// Ser una persona (su sesión) o el servidor (la llave de servicio, sin persona).
const COMO = (sub) => `select set_config('request.jwt.claim.sub', '${sub}', true), set_config('request.jwt.claim.role', 'authenticated', true) \\gset`;
const COMO_SERVIDOR = `select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'service_role', true) \\gset`;
// Cómo quedó un comprobante: estado | ambiente | la marca de la respuesta guardada | motivo de rechazo.
const COMO_QUEDO = (clave, cmp) => `select '${clave}|' || estado || '|' || coalesce(entorno_transmision, '-') || '|'
  || coalesce(respuesta_sunat->>'prueba', '-') || '|' || coalesce(motivo_rechazo, '-')
  from retail.comprobantes where id = :'${cmp}';`;
const INTENTO = (clave, sql) => `select '${clave}|' || pg_temp.intento(${sql});`;
const ESCRIBIR = (cmp, estado, prueba, motivo = null) =>
  `format('select retail.actualizar_transmision_comprobante(%L, %L, %L, %L::jsonb, %L)', :'${cmp}', '${estado}', 'sandbox', '{"estado":"${estado.toUpperCase()}","prueba":"${prueba}"}', ${motivo === null ? "null" : `'${motivo}'`})`;

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  const r = correr(`
begin;
${APLICAR_ANTES}
${COMO(FELIPE)}
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- En la semilla Lima y Trujillo comparten «B001» y el número choca: Trujillo emite aquí con una serie propia.
select count(retail.archivar_serie_comprobante(id, 'prueba automatizada')) as _archivo_tru
  from retail.series_comprobantes where ubicacion_id = :'trujillo' and tipo = 'boleta' and archivada_at is null \\gset
select retail.registrar_serie_comprobante(:'trujillo', 'boleta', 'B096') as _serie_tru \\gset
select retail.emitir_comprobante(:'trujillo', 'boleta', 84.75, 15.25, 100.00) as c \\gset

-- 1. La integrante de la sede
${COMO(MICAELA)}
select 'opera_trujillo|' || retail.fn_puede_operar_ubicacion(:'trujillo')::text;
${INTENTO("integrante_aceptado", ESCRIBIR("c", "aceptado", "integrante"))}
${INTENTO("integrante_rechazado", ESCRIBIR("c", "rechazado", "integrante", "inventado"))}
${INTENTO("integrante_enviado", ESCRIBIR("c", "enviado", "integrante"))}
${COMO_QUEDO("tras_integrante", "c")}

-- 2. El líder
${COMO(FELIPE)}
${INTENTO("lider_aceptado", ESCRIBIR("c", "aceptado", "lider"))}
${COMO_QUEDO("tras_lider", "c")}

-- 3 y 4. El servidor
${COMO_SERVIDOR}
${INTENTO("servidor_aceptado", ESCRIBIR("c", "aceptado", "servidor"))}
${COMO_QUEDO("tras_servidor", "c")}
${INTENTO("servidor_vieja", ESCRIBIR("c", "rechazado", "vieja", "ya emitido"))}
${COMO_QUEDO("tras_vieja", "c")}
${INTENTO("servidor_estado_ajeno", ESCRIBIR("c", "anulado", "servidor"))}
${INTENTO("servidor_no_existe", `format('select retail.actualizar_transmision_comprobante(%L, %L, %L)', gen_random_uuid(), 'aceptado', 'sandbox')`)}

-- 5. Quién puede llamarla
select 'grant_authenticated|' || has_function_privilege('authenticated', 'retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text)', 'execute')::text;
select 'grant_anon|' || has_function_privilege('anon', 'retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text)', 'execute')::text;
select 'grant_service_role|' || has_function_privilege('service_role', 'retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text)', 'execute')::text;
rollback;
`);

  if (!r.ok) {
    console.log("✗ el escenario falló antes de poder probar nada");
    console.log(`    ${r.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l = r.salida.split("\n");
  const dato = (clave) => l.find((x) => x.startsWith(`${clave}|`))?.slice(clave.length + 1) ?? "";

  esperar("la integrante opera Tienda Trujillo (si no, la prueba no prueba nada)", dato("opera_trujillo") === "true", r.salida);
  esperar(
    "la integrante de la sede no escribe «aceptado», «rechazado» ni «enviado» con su sesión (42501)",
    dato("integrante_aceptado").startsWith("42501|") && dato("integrante_rechazado").startsWith("42501|") && dato("integrante_enviado").startsWith("42501|"),
    r.salida,
  );
  esperar("el comprobante no cambia: sigue pendiente, sin respuesta", dato("tras_integrante") === "pendiente|-|-|-", r.salida);
  esperar("el líder tampoco lo escribe con su sesión (42501)", dato("lider_aceptado").startsWith("42501|") && dato("tras_lider") === "pendiente|-|-|-", r.salida);
  esperar(
    "la llave de servicio sí: aceptado, con su ambiente y la respuesta de Lucode",
    dato("servidor_aceptado") === "SIN_ERROR" && dato("tras_servidor") === "aceptado|sandbox|servidor|-",
    r.salida,
  );
  esperar(
    "con la llave de servicio, una respuesta vieja no pisa un aceptado (ADR-0386)",
    dato("servidor_vieja") === "SIN_ERROR" && dato("tras_vieja") === "aceptado|sandbox|servidor|-",
    r.salida,
  );
  esperar("un estado que no es de esta función se rechaza", dato("servidor_estado_ajeno").includes("no maneja el estado anulado"), r.salida);
  esperar("un comprobante que no existe da error", dato("servidor_no_existe").includes("no existe"), r.salida);
  esperar(
    "actualizar_transmision_comprobante es solo de service_role (ni authenticated ni anon)",
    dato("grant_authenticated") === "false" && dato("grant_anon") === "false" && dato("grant_service_role") === "true",
    r.salida,
  );

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
