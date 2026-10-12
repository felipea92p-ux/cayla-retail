#!/usr/bin/env node
/**
 * Prueba de «lo que SUNAT aceptó no retrocede» — CAYLA V2 (ADR-0382,
 * `20261012180000_comprobante_aceptado_no_retrocede.sql`).
 *
 * QUÉ PRUEBA.
 *   1. Una respuesta vieja de Lucode (rechazado por «ya emitido», o en trámite) que llega cuando la boleta ya está
 *      aceptada se ignora SIN error: sigue aceptada, sin motivo de rechazo y con la respuesta que la aceptó.
 *   2. Lo mismo con una boleta ya anulada (la baja viene después de aceptar).
 *   3. Los pasos de siempre siguen pasando: pendiente → cola → en trámite → rechazado → reenvío → aceptado → anulado.
 *   4. El disparador frena a CUALQUIER escritor, no solo a la RPC: un `update` directo que haga retroceder un aceptado,
 *      un anulado o un no emitido falla con su mensaje; y si SUNAT acepta algo que el ERP ya liberó, la RPC NO lo
 *      ignora: falla, porque es una contradicción que tiene que verse.
 *   5. Un cambio que deja el mismo estado (otra consulta en trámite, otro reintento) no pasa por el disparador.
 *
 * LO QUE ESTA NO VE: dos conexiones a la vez. Eso es `sunat_estado_no_retrocede_concurrencia.mjs`, que commitea y por
 * eso va aparte.
 *
 * CÓMO. Igual que `sunat_reintento_por_cron.mjs`: `docker exec ... psql`, una transacción por escenario que termina
 * SIEMPRE en ROLLBACK (corre seguro contra el Postgres local compartido). Las boletas son manuales
 * (`emitir_comprobante`), de Tienda Lima, emitidas por Felipe (líder del seed).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de cada transacción.
 *
 * USO
 *   pnpm pruebas:sunat-estado-no-retrocede    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (supabase/seed.sql)

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const COMO_FELIPE = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claim.role = 'authenticated';`;
// El dueño de la base: un `update` a mano, como el de un script o el SQL Editor. El disparador también lo frena.
const A_MANO = `reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = '';`;

// Una boleta manual pendiente de Tienda Lima, en :'b'.
const FIXTURE = `
begin;
${APLICAR_ANTES}
${COMO_FELIPE}
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as b \\gset
`;

const ACEPTADA = `select retail.actualizar_transmision_comprobante(:'b', 'aceptado', 'sandbox', '{"estado": "ACEPTADO", "prueba": "primera"}'::jsonb) as _a \\gset`;
const FOTO = (clave) =>
  `select '${clave}|' || estado || '|' || coalesce(motivo_rechazo, '-') || '|' || coalesce(respuesta_sunat->>'prueba', '-') from retail.comprobantes where id = :'b';`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 1400).replace(/\n/g, "\n    ")}`);
  }
}

function escenario(nombre, cuerpo, comprobar) {
  const r = correr(`${FIXTURE}\n${cuerpo}\nrollback;\n`);
  if (!r.ok) {
    esperar(nombre, false, r.mensaje);
    return;
  }
  const lineas = r.salida.split("\n");
  const dato = (clave) => lineas.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);
  esperar(nombre, comprobar(dato), r.salida);
}

function denegado(nombre, cuerpo, mensaje) {
  const r = correr(`${FIXTURE}\n${cuerpo}\nrollback;\n`);
  esperar(nombre, !r.ok && r.mensaje.includes(mensaje), r.ok ? `pasó y no debía:\n${r.salida}` : r.mensaje.slice(0, 600));
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. Respuesta vieja tras aceptar: se ignora sin error ----
  escenario(
    "una respuesta vieja («ya emitido» → rechazado, o en trámite) no pisa una boleta aceptada, y no da error",
    `${ACEPTADA}
select retail.actualizar_transmision_comprobante(:'b', 'rechazado', 'sandbox', '{"estado": "RECHAZADO", "prueba": "vieja"}'::jsonb,
  'La boleta fue emitido anteriormente') as _r \\gset
${FOTO("tras_rechazo")}
select retail.actualizar_transmision_comprobante(:'b', 'enviado', 'sandbox', '{"estado": "PENDIENTE", "prueba": "vieja"}'::jsonb) as _e \\gset
${FOTO("tras_tramite")}`,
    (d) => d("tras_rechazo") === "aceptado|-|primera" && d("tras_tramite") === "aceptado|-|primera"
  );

  // ---- 2. Lo mismo con una boleta ya anulada ----
  escenario(
    "una respuesta vieja tampoco pisa una boleta ya anulada (la baja viene después de aceptar)",
    `${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba de ADR-0382' where id = :'b';
${COMO_FELIPE}
select retail.actualizar_transmision_comprobante(:'b', 'aceptado', 'sandbox', '{"estado": "ACEPTADO", "prueba": "vieja"}'::jsonb) as _a2 \\gset
${FOTO("tras_vieja")}`,
    (d) => d("tras_vieja") === "anulado|-|primera"
  );

  // ---- 3. Los pasos de siempre siguen pasando ----
  escenario(
    "los pasos de siempre pasan: pendiente → cola → en trámite → rechazado → reenvío → aceptado → anulado",
    `select retail.fn_marcar_reintento_transmision(:'b', 'sin_respuesta: prueba') as _m \\gset
${FOTO("cola")}
select retail.actualizar_transmision_comprobante(:'b', 'enviado', 'sandbox', '{"estado": "PENDIENTE", "prueba": "tramite"}'::jsonb) as _e \\gset
${FOTO("tramite")}
select retail.actualizar_transmision_comprobante(:'b', 'rechazado', 'sandbox', '{"estado": "RECHAZADO", "prueba": "rechazo"}'::jsonb, 'RUC no habido') as _r \\gset
${FOTO("rechazado")}
select retail.actualizar_transmision_comprobante(:'b', 'enviado', 'sandbox', '{"estado": "PENDIENTE", "prueba": "reenvio"}'::jsonb) as _e2 \\gset
${FOTO("reenvio")}
select retail.actualizar_transmision_comprobante(:'b', 'aceptado', 'sandbox', '{"estado": "ACEPTADO", "prueba": "acepta"}'::jsonb) as _a \\gset
${FOTO("aceptado")}
${A_MANO}
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba de ADR-0382' where id = :'b';
${FOTO("anulado")}`,
    (d) =>
      d("cola") === "pendiente_reintento|-|-" &&
      d("tramite") === "enviado|-|tramite" &&
      d("rechazado") === "rechazado|RUC no habido|rechazo" &&
      d("reenvio") === "enviado|-|reenvio" &&
      d("aceptado") === "aceptado|-|acepta" &&
      d("anulado") === "anulado|-|acepta"
  );

  escenario(
    "una boleta pendiente que nunca salió se puede liberar (no emitido), como siempre",
    `${A_MANO}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'prueba de ADR-0382' where id = :'b';
${FOTO("liberada")}`,
    (d) => d("liberada") === "no_emitido|-|-"
  );

  // ---- 4. El disparador frena a cualquier escritor ----
  denegado(
    "un update a mano no puede devolver a la cola una boleta aceptada",
    `${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'pendiente_reintento' where id = :'b';`,
    "no puede pasar a «pendiente_reintento»"
  );
  denegado(
    "un update a mano no puede marcar rechazada una boleta aceptada",
    `${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'rechazado' where id = :'b';`,
    "está «aceptado» y no puede pasar a «rechazado»"
  );
  denegado(
    "un update a mano no puede liberar (no emitido) una boleta aceptada",
    `${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'x' where id = :'b';`,
    "no puede pasar a «no_emitido»"
  );
  denegado(
    "una boleta anulada no vuelve a aceptada",
    `${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba' where id = :'b';
update retail.comprobantes set estado = 'aceptado' where id = :'b';`,
    "está «anulado» y no puede pasar a «aceptado»"
  );
  denegado(
    "si SUNAT acepta algo que el ERP ya liberó, la RPC NO lo ignora: falla, para que se vea",
    `${A_MANO}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'prueba de ADR-0382' where id = :'b';
${COMO_FELIPE}
select retail.actualizar_transmision_comprobante(:'b', 'aceptado', 'sandbox', '{"estado": "ACEPTADO"}'::jsonb);`,
    "está «no_emitido» y no puede pasar a «aceptado»"
  );
  denegado(
    "un rechazado no se libera a mano (ya llegó a SUNAT, ADR-0093)",
    `select retail.actualizar_transmision_comprobante(:'b', 'rechazado', 'sandbox', null, 'RUC no habido') as _r \\gset
${A_MANO}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'x' where id = :'b';`,
    "está «rechazado» y no puede pasar a «no_emitido»"
  );
  denegado(
    "una boleta en la cola no vuelve a «pendiente»",
    `select retail.fn_marcar_reintento_transmision(:'b', 'sin_respuesta: prueba') as _m \\gset
${A_MANO}
update retail.comprobantes set estado = 'pendiente' where id = :'b';`,
    "no puede pasar a «pendiente»"
  );

  // ---- 5. Mismo estado: no pasa por el disparador ----
  escenario(
    "un cambio que deja el mismo estado (otra consulta en trámite, otro reintento) pasa como siempre",
    `select retail.actualizar_transmision_comprobante(:'b', 'enviado', 'sandbox', '{"estado": "PENDIENTE", "prueba": "una"}'::jsonb) as _e \\gset
select retail.actualizar_transmision_comprobante(:'b', 'enviado', 'sandbox', '{"estado": "PENDIENTE", "prueba": "otra"}'::jsonb) as _e2 \\gset
${FOTO("dos_consultas")}
${ACEPTADA}
${A_MANO}
update retail.comprobantes set estado = 'aceptado', anulacion_solicitada_at = now() where id = :'b';
${FOTO("baja_pedida")}`,
    (d) => d("dos_consultas") === "enviado|-|otra" && d("baja_pedida") === "aceptado|-|primera"
  );

  console.log(`\n${total - fallos}/${total} ${fallos === 0 ? "— todo bien" : "— HAY FALLOS"}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
