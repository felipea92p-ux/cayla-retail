#!/usr/bin/env node
/**
 * La cola de impresión (migración `20261116204000_cola_de_impresion.sql`): vender en el piso y que la boleta salga en la caja.
 *
 * PROMETE
 *   · Pedir dos veces la misma venta deja UNA pedida viva (doble toque, reintento); ya impresa, se puede pedir otra (reimprimir).
 *   · Tomar devuelve la más antigua de la sede, la marca tomada y dice cuántas faltan; tomar otra vez no devuelve la misma.
 *   · Marcar impresa la cierra; marcar dos veces no hace nada; marcar un fallo la devuelve a la cola.
 *   · Una tomada que no se marcó en 2 minutos vuelve a la cola; tras 5 intentos se deja.
 *   · Lo pedido hace más de 12 horas no se toma; una venta anulada no se pide ni se toma.
 *   · Sin la sede (o sin el módulo Vender) la base rechaza con 42501.
 *   · DOS CAJAS A LA VEZ (dos sesiones de Postgres de verdad): con una pedida, una sola caja la toma.
 * CONTROL: sin el índice único parcial, pedir dos veces deja dos filas: la prueba de «una pedida viva» muerde.
 *
 * CÓMO. Cada caso carga la migración dentro de una transacción que termina en ROLLBACK (la base local la comparten otras
 * sesiones). El caso de dos cajas necesita dos sesiones que vean la misma fila, así que aplica la migración (idempotente)
 * y deja UNA pedida de una venta que ya existe; al final la borra. Si la base no tiene ventas, ese caso se omite y lo dice.
 *
 * USO: pnpm pruebas:cola-de-impresion   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261116204000_cola_de_impresion.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003"; // opera Trujillo, no Lima

const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "\t", "-f", "-"];

function psql(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, error: String(e.stderr ?? e.message) };
  }
}

/** Abre la transacción con la migración, una venta nueva en Lima y otra en Trujillo, y Felipe como usuario. */
const preparar = `
begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.ventas (ubicacion_id, es_prueba) values (:'lima', true) returning id as v1 \\gset
insert into retail.ventas (ubicacion_id, es_prueba) values (:'lima', true) returning id as v2 \\gset
insert into retail.ventas (ubicacion_id, es_prueba) values (:'trujillo', true) returning id as vt \\gset
`;
const caso = (cuerpo) => psql(`${preparar}\n${cuerpo}\nrollback;`);

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);

// --- Pedir -------------------------------------------------------------------------------------------------------------
{
  const r = caso(`
select retail.pedir_impresion(:'v1') as a \\gset
select retail.pedir_impresion(:'v1') as b \\gset
select (:'a' = :'b')::text, (select count(*) from retail.impresiones where venta_id = :'v1')::text;`);
  esperar("pedir dos veces la misma venta deja una sola pedida viva", r.ok && lineas(r).at(-1) === "true\t1", r.error ?? r.salida);
}

// --- Tomar, marcar, reimprimir -----------------------------------------------------------------------------------------
{
  const r = caso(`
select retail.pedir_impresion(:'v1') as p1 \\gset
select retail.pedir_impresion(:'v2') as p2 \\gset
-- Dentro de una transacción now() no avanza: la de v1 se pidió un minuto antes, como pasaría con dos ventas de verdad.
update retail.impresiones set pedida_en = now() - interval '1 minute' where id = :'p1';
select impresion_id as t1, venta_id as tv1, pendientes as falta1 from retail.tomar_impresion(:'lima', 'Caja de prueba') \\gset
select impresion_id as t2 from retail.tomar_impresion(:'lima', 'Caja de prueba') \\gset
select coalesce(impresion_id::text, 'nada') as t3 from retail.tomar_impresion(:'lima', 'Caja de prueba') \\gset
select retail.marcar_impresion(:'t1', true);
select retail.marcar_impresion(:'t1', true);
select retail.pedir_impresion(:'v1') as p1b \\gset
select concat_ws('|', (:'tv1' = :'v1'), :'falta1', (:'t2' = :'p2'), :'t3',
  (select estado from retail.impresiones where id = :'t1'), (:'p1b' <> :'p1'));`);
  const [orden, falta, segunda, nada, estado, reimprime] = (lineas(r).at(-1) ?? "").split("|");
  esperar("tomar devuelve la más antigua de la sede y dice cuántas faltan", r.ok && orden === "t" && falta === "1", r.error ?? r.salida);
  esperar("tomar otra vez devuelve la siguiente, nunca la misma; sin más, nada", r.ok && segunda === "t" && nada === "nada", r.error ?? r.salida);
  esperar("marcar impresa la cierra, y marcarla dos veces no hace nada", r.ok && estado === "impresa", r.error ?? r.salida);
  esperar("ya impresa, la venta se puede pedir otra vez (reimprimir)", r.ok && reimprime === "t", r.error ?? r.salida);
}

// --- Fallo, caja colgada, intentos, vencidas, anuladas ------------------------------------------------------------------
{
  const r = caso(`
select retail.pedir_impresion(:'v1') as p \\gset
select impresion_id as t from retail.tomar_impresion(:'lima', 'Caja A') \\gset
select retail.marcar_impresion(:'t', false);
select (select estado from retail.impresiones where id = :'p') as tras_fallo \\gset
select coalesce(impresion_id::text, 'nada') as otra_vez from retail.tomar_impresion(:'lima', 'Caja A') \\gset
select coalesce(impresion_id::text, 'nada') as recien from retail.tomar_impresion(:'lima', 'Caja B') \\gset
update retail.impresiones set tomada_en = now() - interval '3 minutes' where id = :'p';
select coalesce(impresion_id::text, 'nada') as colgada from retail.tomar_impresion(:'lima', 'Caja B') \\gset
update retail.impresiones set estado = 'pendiente', intentos = 5 where id = :'p';
select coalesce(impresion_id::text, 'nada') as cinco from retail.tomar_impresion(:'lima', 'Caja B') \\gset
update retail.impresiones set intentos = 0, pedida_en = now() - interval '13 hours' where id = :'p';
select coalesce(impresion_id::text, 'nada') as vieja from retail.tomar_impresion(:'lima', 'Caja B') \\gset
select concat_ws('|', :'tras_fallo', (:'otra_vez' = :'p'), :'recien', (:'colgada' = :'p'), :'cinco', :'vieja');`);
  const [trasFallo, otraVez, recien, colgada, cinco, vieja] = (lineas(r).at(-1) ?? "").split("|");
  esperar("un fallo de impresión la devuelve a la cola y se vuelve a tomar", r.ok && trasFallo === "pendiente" && otraVez === "t", r.error ?? r.salida);
  esperar("una recién tomada no la toma otra caja", r.ok && recien === "nada", r.error ?? r.salida);
  esperar("una tomada hace 3 minutos sin marcar vuelve a la cola", r.ok && colgada === "t", r.error ?? r.salida);
  esperar("tras 5 intentos se deja (no gasta el rollo en bucle)", r.ok && cinco === "nada", r.error ?? r.salida);
  esperar("lo pedido hace más de 12 horas no se toma", r.ok && vieja === "nada", r.error ?? r.salida);
}
{
  const r = caso(`
select retail.pedir_impresion(:'v1') as p \\gset
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'v1';
select coalesce(impresion_id::text, 'nada') from retail.tomar_impresion(:'lima', 'Caja A');`);
  esperar("una venta anulada después de pedirla no se toma", r.ok && lineas(r).at(-1) === "nada", r.error ?? r.salida);
}
{
  const r = caso(`
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'v1';
select retail.pedir_impresion(:'v1');`);
  esperar("una venta anulada no se pide", !r.ok && /venta_anulada|anulada/.test(r.error), r.error ?? r.salida);
}

// --- Permisos -----------------------------------------------------------------------------------------------------------
for (const [nombre, sql] of [
  ["pedir", "select retail.pedir_impresion(:'v1');"],
  ["tomar", "select * from retail.tomar_impresion(:'lima', 'Caja A');"],
]) {
  const r = caso(`set local request.jwt.claim.sub = '${MICAELA}';\n${sql}`);
  esperar(`${nombre} en una sede que la cuenta no opera: 42501`, !r.ok && /sede_ajena|No operas/.test(r.error), r.error ?? r.salida);
}
{
  const r = caso(`
select retail.pedir_impresion(:'vt') as p \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select retail.fn_impresion_estado(:'p');`);
  esperar("el celular de la sede ve el estado de su pedida", r.ok && lineas(r).at(-1) === "pendiente", r.error ?? r.salida);
}
{
  const r = caso(`select * from retail.tomar_impresion(:'lima', '  ');`);
  esperar("tomar sin nombre de equipo se rechaza", !r.ok && /equipo_invalido|equipo/.test(r.error), r.error ?? r.salida);
}

// --- Control: el índice único es lo que impide la pedida doble -------------------------------------------------------------
{
  const r = caso(`
drop index retail.impresiones_una_viva_por_venta;
insert into retail.impresiones (venta_id, ubicacion_id) values (:'v1', :'lima'), (:'v1', :'lima');
select count(*) from retail.impresiones where venta_id = :'v1';`);
  esperar("CONTROL: sin el índice único, la misma venta queda pedida dos veces", r.ok && lineas(r).at(-1) === "2", r.error ?? r.salida);
}

// --- Dos cajas a la vez (dos sesiones de verdad) -----------------------------------------------------------------------------
{
  const aplicada = psql(MIGRACION);
  const venta = psql(`select v.id || E'\\t' || v.ubicacion_id from retail.ventas v where v.estado = 'completada'
     and not exists (select 1 from retail.impresiones i where i.venta_id = v.id and i.estado <> 'impresa') limit 1;`);
  const [ventaId, sede] = (venta.ok ? venta.salida : "").split("\t");
  if (!aplicada.ok || !ventaId) {
    console.log(`- dos cajas a la vez: omitido (${!aplicada.ok ? "no se pudo aplicar la migración" : "la base no tiene ventas"})`);
  } else {
    const pedida = psql(`insert into retail.impresiones (venta_id, ubicacion_id) values ('${ventaId}', '${sede}') returning id;`);
    const id = pedida.ok ? pedida.salida : null;
    const sesion = (nombre) =>
      new Promise((listo) => {
        const p = spawn("docker", ARGS);
        let salida = "";
        p.stdout.on("data", (d) => (salida += d));
        p.stderr.on("data", (d) => (salida += d));
        p.on("close", () => listo(salida.trim()));
        p.stdin.end(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
select coalesce(impresion_id::text, 'nada') from retail.tomar_impresion('${sede}', '${nombre}');
select pg_sleep(1.5);
commit;`);
      });
    const [a, b] = await Promise.all([sesion("Caja A"), sesion("Caja B")]);
    const tomaron = [a, b].filter((s) => s.split("\n").some((l) => l.trim() === id)).length;
    esperar("dos cajas a la vez: una sola toma la boleta", tomaron === 1, `Caja A: ${a}\nCaja B: ${b}`);
    psql(`delete from retail.impresiones where id = '${id}';`);
  }
}

console.log(`\n${total - fallas}/${total} verificaciones en verde.`);
process.exit(fallas ? 1 : 0);
