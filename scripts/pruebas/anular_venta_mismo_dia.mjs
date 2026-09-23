#!/usr/bin/env node
/**
 * Prueba de PL-29: `anular_venta` solo anula el MISMO día calendario de Lima en que se vendió
 * (migración `20260923235300_anular_venta_mismo_dia.sql`).
 *
 * La escena es una venta SIN prendas en una caja abierta de Tienda Trujillo, insertada como
 * `postgres` con el `created_at` que cada caso necesita: con cero líneas, `anular_venta`
 * recorre todos sus candados (líder, motivo, caja abierta, comprobante, cambios, líneas) sin
 * depender de stock ni de `registrar_venta`. Cada caso corre en su transacción que TERMINA EN
 * ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * Los bordes van en hora de LIMA a propósito: una venta de ayer a las 23:59 de Lima ya es «hoy»
 * en UTC, que es donde corre la base. Si alguien compara en UTC (`created_at::date <>
 * current_date`), el caso de las 23:59 lo atrapa (mutación verificada el 2026-09-23).
 *
 * USO: pnpm pruebas:anular-venta-mismo-dia   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260923235300_anular_venta_mismo_dia.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Una venta vacía con ese `created_at` (expresión SQL) en una caja abierta; deja `:venta`. */
const escena = (creadaEn) => `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
with existente as (select id from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta' limit 1),
nueva as (insert into retail.cajas (ubicacion_id, monto_apertura)
          select :'ubic', 0 where not exists (select 1 from existente) returning id)
select id as caja from existente union all select id from nueva \\gset
insert into retail.ventas (ubicacion_id, caja_id, created_at) values (:'ubic', :'caja', ${creadaEn}) returning id as venta \\gset
`;

// El «cómo se deshace»: quita el bloque PL-29 (el `end if;` y las 3 líneas que agregó la
// migración). Si el candado no está, no cambia nada. El control lo usa para simular la base
// de antes, porque en el CI y en producción la migración ya está puesta.
const DESHACER = `
do $d$ declare v text := pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure);
begin execute regexp_replace(v, '\\n  end if;\\n  -- PL-29:[^\\n]*\\n[^\\n]*\\n[^\\n]*', ''); end $d$;
`;

/** Anula como líder y devuelve el estado final de la venta; si la base rechaza, lanza. */
function anular(creadaEn, { conCandado = true } = {}) {
  return psql(`
begin;
${conCandado ? MIGRACION : DESHACER}
${escena(creadaEn)}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.anular_venta(:'venta', 'prueba PL-29', '[]'::jsonb);
select estado from retail.ventas where id = :'venta';
rollback;
`);
}

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}

/** El caso pasa si la base rechaza con el mensaje del candado. */
function rechaza(creadaEn) {
  try {
    return `se anuló y debía rechazarse (estado: ${anular(creadaEn)})`;
  } catch (e) {
    if (!/día anterior/.test(String(e.stderr))) throw e;
  }
}

const AYER = "now() - interval '1 day'";
const AYER_2359_LIMA = "((retail.fn_hoy_lima() - 1) + time '23:59') at time zone 'America/Lima'";
const HOY_0000_LIMA = "(retail.fn_hoy_lima() + time '00:00:30') at time zone 'America/Lima'";

caso("CONTROL: deshecho el candado, una venta de ayer SÍ se anula (el hueco existía)", () => {
  const estado = anular(AYER, { conCandado: false });
  if (estado !== "anulada") return `estado: ${estado}`;
});
caso("con la migración, la venta de ayer se rechaza", () => rechaza(AYER));
caso("con la migración, la venta de ayer a las 23:59 de Lima se rechaza (hoy en UTC)", () => rechaza(AYER_2359_LIMA));
caso("con la migración, la venta de hoy se anula", () => {
  const estado = anular("now()");
  if (estado !== "anulada") return `estado: ${estado}`;
});
caso("con la migración, la venta de hoy a las 00:00 de Lima se anula", () => {
  const estado = anular(HOY_0000_LIMA);
  if (estado !== "anulada") return `estado: ${estado}`;
});
caso("la migración se puede pegar dos veces: el candado queda una sola vez", () => {
  const n = psql(`
begin;
${MIGRACION}
${MIGRACION}
select (length(d) - length(replace(d, '-- PL-29:', ''))) / length('-- PL-29:')
  from pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure) d;
rollback;`);
  if (n !== "1") return `el candado aparece ${n} veces`;
});
caso("migración y deshacer van y vuelven: la función queda idéntica a la de antes", () => {
  const HUELLA = `select md5(regexp_replace(pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure), '\\s+', '', 'g'));`;
  const [antes, despues] = psql(`
begin;
${DESHACER}
${HUELLA}
${MIGRACION}
${DESHACER}
${HUELLA}
rollback;`).split("\n").filter(Boolean);
  if (!antes || antes !== despues) return `antes ${antes} · después ${despues}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
