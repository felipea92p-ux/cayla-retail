#!/usr/bin/env node
/**
 * Prueba del reintento a SUNAT por trabajo programado — CAYLA V2 (PL-113,
 * `20260924113817_sunat_reintento_por_cron.sql`).
 *
 * QUÉ PRUEBA.
 *   1. La llave de servicio (el cron de Vercel) toma lo emitido en las últimas 4 horas y NO lo más viejo
 *      (pasado eso lo avisa el Inicio del líder); una segunda pasada inmediata no vuelve a tomar lo mismo
 *      (la reserva de 5 minutos: el «token de idempotencia»).
 *   2. La llave de servicio puede anotar un intento fallido y guardar lo que respondió Lucode (las dos
 *      funciones de escritura que usa `transmitirComprobante`).
 *   3. El barrido del líder (navegador) no cambió: sigue tomando un pendiente de 5 horas.
 *   4. Los candados siguen cerrados para quien no es ni líder ni la llave de servicio — también sin claims
 *      (psql directo), el caso en que `auth.role()` es null.
 *
 * CÓMO. Igual que `comprobante_venta_anulada.mjs`: `docker exec ... psql`, una transacción por escenario que
 * termina SIEMPRE en ROLLBACK. La llave de servicio se simula como la arma PostgREST: `set local role
 * service_role` + `request.jwt.claim.role = 'service_role'` y sin `sub`.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo.sql>` mete ese SQL dentro de la transacción.
 *
 * USO
 *   pnpm pruebas:sunat-reintento-por-cron    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (supabase/seed.sql)
const NADIE = "99999999-9999-4999-8999-999999999999"; // una sesión sin persona en retail

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const COMO_CRON = `set local role service_role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'service_role';`;
const COMO_FELIPE = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claim.role = 'authenticated';`;

// Cuatro boletas manuales de Tienda Lima: dos recientes y dos de hace más de 4 horas, una de cada par ya en la
// cola de reintento y vencida. Todo lo demás pendiente de la base local se corre un día, para que no se cuele.
const FIXTURE = `
begin;
${APLICAR_ANTES}
${COMO_FELIPE}
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as nuevo \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as viejo \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as cola_nueva \\gset
select retail.emitir_comprobante(:'ubic', 'boleta', 84.75, 15.25, 100.00) as cola_vieja \\gset
reset role;
update retail.comprobantes set created_at = now() - interval '10 minutes' where id = :'nuevo';
update retail.comprobantes set created_at = now() - interval '5 hours' where id = :'viejo';
update retail.comprobantes set created_at = now() - interval '1 hour', estado = 'pendiente_reintento',
    intentos_transmision = 1, proximo_reintento_at = now() - interval '1 minute' where id = :'cola_nueva';
update retail.comprobantes set created_at = now() - interval '6 hours', estado = 'pendiente_reintento',
    intentos_transmision = 5, proximo_reintento_at = now() - interval '1 minute' where id = :'cola_vieja';
update retail.comprobantes set proximo_reintento_at = now() + interval '1 day'
 where estado in ('pendiente', 'pendiente_reintento') and id not in (:'nuevo', :'viejo', :'cola_nueva', :'cola_vieja');
`;

// Cuáles de las cuatro devolvió una llamada a `fn_tomar_comprobantes_para_reintento`, en orden fijo.
const CUALES = (clave) => `select '${clave}|' || coalesce(string_agg(n, ',' order by n), '') from (
  select case t when :'nuevo'::uuid then 'nuevo' when :'viejo'::uuid then 'viejo'
              when :'cola_nueva'::uuid then 'cola_nueva' when :'cola_vieja'::uuid then 'cola_vieja' end n
    from unnest(:'${clave}'::uuid[]) t) x where n is not null;`;
const TOMAR = (clave) => `select coalesce(array_agg(t), '{}')::text as ${clave} from retail.fn_tomar_comprobantes_para_reintento(null, 20) t \\gset
${CUALES(clave)}`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${JSON.stringify(detalle).slice(0, 900)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- Escenario 1: la llave de servicio toma, anota y guarda; el líder sigue como antes ----
  const r = correr(`${FIXTURE}
${COMO_CRON}
${TOMAR("cron1")}
${TOMAR("cron2")}
select retail.fn_marcar_reintento_transmision(:'nuevo', 'sin_respuesta: prueba del cron') as _m \\gset
select retail.actualizar_transmision_comprobante(:'cola_nueva', 'aceptado', 'sandbox', '{"prueba": true}'::jsonb) as _a \\gset
reset role;
select 'marcado|' || estado || '|' || intentos_transmision from retail.comprobantes where id = :'nuevo';
select 'guardado|' || estado || '|' || entorno_transmision from retail.comprobantes where id = :'cola_nueva';
${COMO_FELIPE}
${TOMAR("lider")}
rollback;
`);
  if (!r.ok) {
    console.log("✗ el escenario principal falló antes de poder probar nada");
    console.log(`    ${r.mensaje.slice(0, 1400)}`);
    process.exit(1);
  }
  const lineas = r.salida.split("\n");
  const dato = (clave) => lineas.find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1);

  esperar("la llave de servicio toma lo de menos de 4 horas (pendiente y en cola) y deja lo más viejo", dato("cron1") === "cola_nueva,nuevo", r.salida);
  esperar("una segunda pasada inmediata no vuelve a tomar lo reservado", dato("cron2") === "", r.salida);
  esperar("la llave de servicio anota un intento fallido (pasa a la cola)", dato("marcado") === "pendiente_reintento|1", r.salida);
  esperar("la llave de servicio guarda lo que respondió Lucode", dato("guardado") === "aceptado|sandbox", r.salida);
  esperar("el barrido del líder sigue tomando lo de más de 4 horas", dato("lider") === "cola_vieja,viejo", r.salida);

  // ---- Escenario 2: los candados siguen cerrados para quien no es nadie ----
  const denegado = (nombre, sesion, llamada, mensaje) => {
    const d = correr(`${FIXTURE}
${sesion}
${llamada};
rollback;
`);
    esperar(nombre, !d.ok && d.mensaje.includes(mensaje), d.ok ? d.salida : d.mensaje.slice(0, 400));
  };
  const SIN_PERSONA = `set local role authenticated;
set local request.jwt.claim.sub = '${NADIE}';
set local request.jwt.claim.role = 'authenticated';`;
  const SIN_CLAIMS = `reset role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = '';`;

  denegado("una sesión sin persona no toma la cola de todas las sedes", SIN_PERSONA,
    "select * from retail.fn_tomar_comprobantes_para_reintento(null, 5)", "Solo un líder");
  denegado("una sesión sin persona no anota intentos", SIN_PERSONA,
    "select retail.fn_marcar_reintento_transmision(:'nuevo', 'x')", "No tienes permiso");
  denegado("una sesión sin persona no guarda resultados", SIN_PERSONA,
    "select retail.actualizar_transmision_comprobante(:'nuevo', 'aceptado', 'sandbox')", "No tienes permiso");
  denegado("sin claims (auth.role() null) el candado de tomar sigue cerrado", SIN_CLAIMS,
    "select * from retail.fn_tomar_comprobantes_para_reintento(null, 5)", "Solo un líder");
  denegado("sin claims (auth.role() null) el candado de guardar sigue cerrado", SIN_CLAIMS,
    "select retail.actualizar_transmision_comprobante(:'nuevo', 'aceptado', 'sandbox')", "No tienes permiso");

  console.log(`\n${total - fallos}/${total} ${fallos === 0 ? "— todo bien" : "— HAY FALLOS"}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
