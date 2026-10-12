#!/usr/bin/env node
/**
 * Prueba de concurrencia de ADR-0386 «lo que SUNAT aceptó no retrocede» — `actualizar_transmision_comprobante` con dos
 * conexiones reales y COMMIT.
 *
 * POR QUÉ APARTE. `sunat_estado_no_retrocede.mjs` corre todo en ROLLBACK, en una sola conexión: ahí no se ve lo único que
 * el `for update` arregla, que es lo que pasa cuando la PRIMERA respuesta ya se guardó y la segunda la leyó antes. Esta
 * SÍ commitea, y por eso solo corre en una base desechable: aborta sin `BASE_DESECHABLE=1`. No va en el CI (su Postgres es
 * compartido por todos los pasos). Cada escenario crea su propia boleta de prueba (serie ZPRU, número al azar) y la borra
 * al terminar, pase lo que pase.
 *
 * QUÉ CUBRE (las dos conexiones entran como el trabajo programado, con la llave de servicio)
 *   C1 la aceptación está guardando y llega una respuesta vieja («ya emitido» → rechazado): la segunda ESPERA a la
 *      primera y, al despertar, ve «aceptado» y no lo toca. Sin error para ninguna.
 *   C2 al revés, el avance normal: «en trámite» está guardando y llega «aceptado» → queda aceptado.
 *   C3 la aceptación está guardando y el otro envío anota un corte de tiempo (`fn_marcar_reintento_transmision`): espera y
 *      se niega («ya está en estado aceptado»); la boleta no vuelve a la cola.
 *
 * DÓNDE CORRERLA. En una copia desechable de la base local, nunca en la compartida (las otras sesiones y el espejo de
 * `/flujo-de-negocio` cuentan con ella tal cual). `CONTENEDOR_PG=<nombre>` elige el contenedor; por defecto, el local.
 *
 * USO
 *   BASE_DESECHABLE=1 CONTENEDOR_PG=<contenedor desechable> node scripts/pruebas/sunat_estado_no_retrocede_concurrencia.mjs
 */

import { execFileSync, spawn } from "node:child_process";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA en la base (y borra lo suyo al final). Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 CONTENEDOR_PG=<contenedor> node scripts/pruebas/sunat_estado_no_retrocede_concurrencia.mjs"
  );
  process.exit(1);
}

const CONTENEDOR = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const ARGS = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2000).replace(/\n/g, "\n    ")}`);
  }
}

// La llave de servicio, como la arma PostgREST para el trabajo programado (igual que `sunat_reintento_por_cron.mjs`).
const COMO_CRON = `begin;
set local role service_role;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'service_role';
`;

/** Una boleta de prueba COMMITEADA, pendiente, de la primera tienda. Devuelve su id. */
function nuevaBoleta() {
  const numero = 900000 + Math.floor(Math.random() * 99999);
  return psql(`insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, subtotal, igv, total, items)
  select id, 'boleta', 'ZPRU', ${numero}, 84.75, 15.25, 100.00, '[]'::jsonb from retail.ubicaciones order by nombre limit 1
  returning id;`);
}
const borrar = (id) => psql(`delete from retail.comprobantes where id = '${id}' and serie = 'ZPRU';`);
const foto = (id) =>
  psql(`select estado || '|' || coalesce(motivo_rechazo, '-') || '|' || coalesce(respuesta_sunat->>'quien', '-') from retail.comprobantes where id = '${id}';`);
const guardar = (id, estado, quien, motivo = null) =>
  `select retail.actualizar_transmision_comprobante('${id}', '${estado}', 'sandbox', '{"quien": "${quien}"}'::jsonb${motivo ? `, '${motivo}'` : ""});`;

/** La primera conexión guarda y se queda con la fila 1,5 s; la segunda entra a los 0,4 s. */
async function carrera(primera, segunda) {
  const p1 = psqlAsync(`${COMO_CRON}${primera}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${COMO_CRON}${segunda}\ncommit;\n`);
  return Promise.all([p1, p2]);
}

async function escenario(nombre, fn) {
  const id = nuevaBoleta();
  try {
    await fn(id);
  } catch (e) {
    esperar(nombre, false, e.stack ?? String(e));
  } finally {
    borrar(id);
  }
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR}.`);
    process.exit(1);
  }

  const C1 = "C1 · se guarda «aceptado» y llega una respuesta vieja (rechazado): la segunda espera, ve el aceptado y no lo toca, sin error";
  await escenario(C1, async (id) => {
    const [s1, s2] = await carrera(guardar(id, "aceptado", "primera"), guardar(id, "rechazado", "vieja", "La boleta fue emitido anteriormente"));
    const final = foto(id);
    esperar(C1, s1.code === 0 && s2.code === 0 && s2.ms > 900 && final === "aceptado|-|primera",
      `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · final=${final}`);
  });

  const C2 = "C2 · se guarda «en trámite» y llega «aceptado»: la segunda espera y la boleta queda aceptada";
  await escenario(C2, async (id) => {
    const [s1, s2] = await carrera(guardar(id, "enviado", "tramite"), guardar(id, "aceptado", "acepta"));
    const final = foto(id);
    esperar(C2, s1.code === 0 && s2.code === 0 && s2.ms > 900 && final === "aceptado|-|acepta",
      `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · final=${final}`);
  });

  const C3 = "C3 · se guarda «aceptado» y el otro envío anota un corte de tiempo: espera, se niega y la boleta no vuelve a la cola";
  await escenario(C3, async (id) => {
    const [s1, s2] = await carrera(
      guardar(id, "aceptado", "primera"),
      `select retail.fn_marcar_reintento_transmision('${id}', 'sin_respuesta: Lucode no respondió a tiempo');`
    );
    const final = foto(id);
    esperar(C3, s1.code === 0 && s2.code !== 0 && s2.stderr.includes('ya está en estado "aceptado"') && s2.ms > 900 && final === "aceptado|-|primera",
      `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · final=${final}`);
  });

  console.log(`\n${total - fallos}/${total} ${fallos === 0 ? "— todo bien" : "— HAY FALLOS"}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
