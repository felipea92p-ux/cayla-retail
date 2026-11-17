#!/usr/bin/env node
/**
 * Quién pide y quién confirma la baja de un comprobante ante SUNAT.
 *
 * LA REGLA. Anular un comprobante es irreversible ante SUNAT, y lo que se anula es de una sede.
 *   · Pedir la baja (`anular_comprobante`) es de quien ve Facturación EN LA SEDE del comprobante (`fn_puede_operar_ubicacion`),
 *     como toda operación de una sede. Queda a nombre del responsable y el comprobante sigue «aceptado» con la baja en trámite.
 *   · «Anulado» lo escribe solo el servidor, con la llave de servicio, cuando Lucode dice que SUNAT la confirmó
 *     (`fn_confirmar_baja_sunat`, solo `service_role`). Una sesión de persona —líder incluido— nunca la confirma.
 *
 * QUÉ PRUEBA.
 *   1. Otra sede: una integrante de Trujillo con Facturación no pide la baja de un comprobante de Lima (con ni sin confirmación)
 *      ni la confirma (42501), y el comprobante no cambia.
 *   2. Su sede: pide la baja; queda a su nombre, en trámite, y `p_confirmada = true` no lo deja anulado.
 *   3. Su sede: no la confirma con su sesión (`fn_confirmar_baja_sunat`), y el líder tampoco.
 *   4. La llave de servicio la confirma: «anulado», con la respuesta guardada; quien la pidió sigue siendo quien la pidió.
 *   5. La llave de servicio no confirma lo que nadie pidió.
 *   6. `fn_confirmar_baja_sunat` no se le da a `authenticated` ni a `anon`.
 *
 * CÓMO. Como `anular_venta_comprobante.mjs`: `docker exec ... psql`, `set local request.jwt.claim.sub` para ser cada cuenta de la
 * semilla, `request.jwt.claim.role = 'service_role'` para ser el servidor, y una sola transacción que termina SIEMPRE en ROLLBACK.
 * Los comprobantes se emiten y se aceptan con las RPC reales (`emitir_comprobante`, `actualizar_transmision_comprobante`).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción (que se revierte).
 *
 * USO
 *   pnpm pruebas:anular-comprobante-permisos    → necesita el stack local (`npx supabase start`)
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
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

// Ser una persona (su sesión) o el servidor (la llave de servicio, sin persona).
const COMO = (sub) => `select set_config('request.jwt.claim.sub', '${sub}', true), set_config('request.jwt.claim.role', 'authenticated', true) \\gset`;
const COMO_SERVIDOR = `select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'service_role', true) \\gset`;
// Cómo quedó un comprobante: estado | baja pedida | quién la pidió (micaela/felipe/nadie) | respuesta guardada.
const COMO_QUEDO = (clave, cmp) => `select '${clave}|' || estado || '|' || (anulacion_solicitada_at is not null)::text || '|'
  || case anulado_por when :'micaela_id'::uuid then 'micaela' when :'felipe_id'::uuid then 'felipe' else 'nadie' end || '|'
  || coalesce(respuesta_anulacion->>'estado', '')
  from retail.comprobantes where id = :'${cmp}';`;
// Lo emite el líder y lo acepta el servidor (la respuesta de SUNAT la guarda quien habla con Lucode); después se vuelve a ser el líder.
const ACEPTADO = (ubic, nombre) => `select retail.emitir_comprobante(:'${ubic}', 'boleta', 84.75, 15.25, 100.00) as ${nombre} \\gset
${COMO_SERVIDOR}
select retail.actualizar_transmision_comprobante(:'${nombre}', 'aceptado', 'sandbox', '{}'::jsonb, null) as _acep_${nombre} \\gset
${COMO(FELIPE)}`;
const INTENTO = (clave, sql) => `select '${clave}|' || pg_temp.intento(${sql});`;

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

select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as micaela_id from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as felipe_id from public.personas where auth_user_id = '${FELIPE}' \\gset
-- La integrante ve Facturación: lo único que la separa de un comprobante es la sede.
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'facturacion'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'facturacion');
-- En la semilla Lima y Trujillo comparten «B001» y el número choca: Trujillo emite aquí con una serie propia.
select count(retail.archivar_serie_comprobante(id, 'prueba automatizada')) as _archivo_tru
  from retail.series_comprobantes where ubicacion_id = :'trujillo' and tipo = 'boleta' and archivada_at is null \\gset
select retail.registrar_serie_comprobante(:'trujillo', 'boleta', 'B097') as _serie_tru \\gset

${ACEPTADO("lima", "c_lima")}
${ACEPTADO("trujillo", "c_tru")}
${ACEPTADO("trujillo", "c_sin_pedir")}

-- 1. Otra sede
${COMO(MICAELA)}
select 've_facturacion|' || retail.fn_ve_modulo('facturacion')::text;
${INTENTO("otra_confirmada", `format('select retail.anular_comprobante(%L, %L, true, %L::jsonb)', :'c_lima', 'prueba automatizada', '{"estado":"ACEPTADO"}')`)}
${INTENTO("otra_pedida", `format('select retail.anular_comprobante(%L, %L, false, %L::jsonb)', :'c_lima', 'prueba automatizada', '{"estado":"PENDIENTE"}')`)}
${INTENTO("otra_confirma", `format('select retail.fn_confirmar_baja_sunat(%L, %L::jsonb)', :'c_lima', '{"estado":"ACEPTADO"}')`)}
${COMO_QUEDO("otra_quedo", "c_lima")}

-- 2. Su sede: pide la baja diciendo que ya está confirmada
${INTENTO("suya_pide", `format('select retail.anular_comprobante(%L, %L, true, %L::jsonb)', :'c_tru', 'prueba automatizada', '{"estado":"ACEPTADO"}')`)}
${COMO_QUEDO("suya_quedo", "c_tru")}

-- 3. Nadie confirma con su sesión
${INTENTO("suya_confirma", `format('select retail.fn_confirmar_baja_sunat(%L, %L::jsonb)', :'c_tru', '{"estado":"ACEPTADO"}')`)}
${COMO(FELIPE)}
${INTENTO("lider_confirma", `format('select retail.fn_confirmar_baja_sunat(%L, %L::jsonb)', :'c_tru', '{"estado":"ACEPTADO"}')`)}
${INTENTO("lider_anula_confirmada", `format('select retail.anular_comprobante(%L, %L, true, %L::jsonb)', :'c_tru', 'prueba automatizada', '{"estado":"ACEPTADO"}')`)}
${COMO_QUEDO("sin_servidor_quedo", "c_tru")}

-- 4 y 5. El servidor
${COMO_SERVIDOR}
${INTENTO("servidor_confirma", `format('select retail.fn_confirmar_baja_sunat(%L, %L::jsonb)', :'c_tru', '{"estado":"ACEPTADO"}')`)}
${COMO_QUEDO("servidor_quedo", "c_tru")}
${INTENTO("servidor_sin_pedir", `format('select retail.fn_confirmar_baja_sunat(%L, %L::jsonb)', :'c_sin_pedir', '{"estado":"ACEPTADO"}')`)}
${COMO_QUEDO("sin_pedir_quedo", "c_sin_pedir")}

-- 6. Quién puede llamar a la confirmación
select 'grant_authenticated|' || has_function_privilege('authenticated', 'retail.fn_confirmar_baja_sunat(uuid, jsonb)', 'execute')::text;
select 'grant_anon|' || has_function_privilege('anon', 'retail.fn_confirmar_baja_sunat(uuid, jsonb)', 'execute')::text;
select 'grant_service_role|' || has_function_privilege('service_role', 'retail.fn_confirmar_baja_sunat(uuid, jsonb)', 'execute')::text;
rollback;
`);

  if (!r.ok) {
    console.log("✗ el escenario falló antes de poder probar nada");
    console.log(`    ${r.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const l = r.salida.split("\n");
  const dato = (clave) => l.find((x) => x.startsWith(`${clave}|`))?.slice(clave.length + 1) ?? "";

  esperar("la integrante de Trujillo ve Facturación (si no, la prueba no prueba la sede)", dato("ve_facturacion") === "true", r.salida);
  esperar(
    "otra sede no pide la baja de un comprobante, ni diciéndola confirmada (42501)",
    dato("otra_confirmada").startsWith("42501|") && dato("otra_pedida").startsWith("42501|"),
    r.salida,
  );
  esperar("otra sede no confirma la baja de un comprobante (42501)", dato("otra_confirma").startsWith("42501|"), r.salida);
  esperar("el comprobante de la otra sede no cambia: aceptado, sin baja pedida", dato("otra_quedo") === "aceptado|false|nadie|", r.salida);
  esperar(
    "en su sede pide la baja: queda a su nombre y en trámite, aunque diga que ya está confirmada",
    dato("suya_pide") === "SIN_ERROR" && dato("suya_quedo") === "aceptado|true|micaela|ACEPTADO",
    r.salida,
  );
  esperar(
    "una sesión de persona no confirma la baja, ni la integrante de la sede ni el líder (42501)",
    dato("suya_confirma").startsWith("42501|") && dato("lider_confirma").startsWith("42501|"),
    r.salida,
  );
  esperar(
    "el líder pidiéndola «confirmada» tampoco la deja anulada: sigue en trámite",
    dato("lider_anula_confirmada") === "SIN_ERROR" && dato("sin_servidor_quedo").startsWith("aceptado|true|"),
    r.salida,
  );
  esperar(
    "la llave de servicio confirma: anulado, con su respuesta, y quien la pidió sigue siendo quien la pidió",
    dato("servidor_confirma") === "SIN_ERROR" && dato("servidor_quedo").startsWith("anulado|true|") && dato("servidor_quedo").endsWith("|ACEPTADO"),
    r.salida,
  );
  esperar(
    "la llave de servicio no confirma una baja que nadie pidió",
    dato("servidor_sin_pedir").includes("no tiene una baja pedida") && dato("sin_pedir_quedo") === "aceptado|false|nadie|",
    r.salida,
  );
  esperar(
    "fn_confirmar_baja_sunat es solo de service_role (ni authenticated ni anon)",
    dato("grant_authenticated") === "false" && dato("grant_anon") === "false" && dato("grant_service_role") === "true",
    r.salida,
  );

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
