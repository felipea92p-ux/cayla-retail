#!/usr/bin/env node
/**
 * Candado «una sola firma por función» contra la base REAL (ADR-0009, ADR-0026).
 *
 * El problema: `create or replace function` con OTRA lista de parámetros no reemplaza nada, crea una
 * SOBRECARGA y la vieja sigue viva; PostgREST deja de saber a cuál llamar y la pantalla responde «function is
 * not unique» (pasó con registrar_movimiento, catalogo_actualizar_producto y registrar_compra). Ninguna
 * prueba miraba las funciones que no tocó su propia migración.
 *
 * PROMETE: sale con 1 —y nombra cada función con sus firmas— si algún nombre del esquema `retail` tiene más
 * de una firma en `pg_proc` tras aplicar TODAS las migraciones y el seed. Sale con 0 si cada nombre tiene una.
 * ASUME: el stack local levantado (`npx supabase start`), el mismo que usan las demás pruebas de este job.
 * NO CUBRE: `public` (es de Dynamic y ajeno: sus sobrecargas no las causa este repo, y Dynamic puede tener las
 * suyas a propósito) ni `auth`/`storage`. Solo `retail`, que es lo que este repo escribe.
 *
 * POR QUÉ CONTRA LA BASE Y NO LEYENDO LAS MIGRACIONES. Un intento anterior simulaba en texto los create/drop
 * de las 277 migraciones; necesitaba una lista escrita a mano de las migraciones que reescriben una función con
 * DO + EXECUTE (el texto no las ve), y daba rojos falsos cada vez que aparecía una nueva. El motor ya sabe qué
 * firmas hay: preguntarle es más corto y no puede desfasarse de la realidad.
 *
 * CONTROL: dentro de una transacción que termina en ROLLBACK se crean a propósito `retail.zz_control_sobrecarga(int)`
 * y `retail.zz_control_sobrecarga(text)` y se exige que la MISMA consulta las delate. Sin ese caso, alguien podría
 * aflojar la consulta (`having count(*) > 5`) y el candado seguiría en verde sin morder.
 *
 * USO: pnpm pruebas:una-sola-firma   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

function psql(sql) {
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "\t", "-f", "-"],
      { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch (e) {
    // Sin base (o sin el esquema retail) el candado no puede decir nada: se cae con el motivo, no con un stack.
    console.error(`✗ No pude consultar la base local (¿levantaste \`npx supabase start\`?):\n${String(e.stderr ?? e.message).trim()}`);
    process.exit(1);
  }
}

// Una fila por firma, solo de los nombres repetidos. El criterio es el de siempre: mismo nombre, más de una fila.
const SOBRECARGAS = `
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
where p.pronamespace = 'retail'::regnamespace
  and p.proname in (
    select proname from pg_proc where pronamespace = 'retail'::regnamespace group by proname having count(*) > 1
  )
order by p.proname, p.oid;
`;

/** Agrupa las filas `nombre<TAB>argumentos` por función: { nombre → [firmas] }. */
function agrupar(salida) {
  const porNombre = new Map();
  for (const fila of salida.split("\n").filter(Boolean)) {
    const [nombre, args = ""] = fila.split("\t");
    porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), args]);
  }
  return porNombre;
}

// ---- CONTROL: la consulta muerde ---------------------------------------------------------------------------
const control = agrupar(
  psql(`begin;
create or replace function retail.zz_control_sobrecarga(a int) returns int language sql as 'select 1';
create or replace function retail.zz_control_sobrecarga(a text) returns int language sql as 'select 2';
${SOBRECARGAS}
rollback;`)
);
if (!control.has("zz_control_sobrecarga") || control.get("zz_control_sobrecarga").length !== 2) {
  console.error("✗ CONTROL roto: dos sobrecargas creadas a propósito NO fueron detectadas; el candado no muerde.");
  process.exit(1);
}
console.log("✓ CONTROL: dos sobrecargas creadas a propósito (retail.zz_control_sobrecarga) se detectan");

// ---- La base real ----------------------------------------------------------------------------------------
// Sin funciones en `retail` el candado estaría «en verde» sin mirar nada: se exige que haya algo que mirar.
// (Si el esquema `retail` no existiera, el cast a regnamespace ya hace fallar a psql.)
const total = Number(psql("select count(*) from pg_proc where pronamespace = 'retail'::regnamespace;"));
if (!(total > 0)) {
  console.error("✗ El esquema retail no tiene funciones: ¿se aplicaron las migraciones? Un verde aquí no diría nada.");
  process.exit(1);
}

const repetidas = agrupar(psql(SOBRECARGAS));
if (repetidas.size > 0) {
  console.error(`✗ ${repetidas.size} función(es) de retail con más de una firma viva (de ${total} funciones):\n`);
  for (const [nombre, firmas] of repetidas) {
    console.error(`  retail.${nombre}`);
    for (const f of firmas) console.error(`      (${f})`);
  }
  console.error(
    "\n  Un `create or replace function` con OTRA lista de parámetros no reemplaza: crea una sobrecarga y la vieja sigue viva." +
      "\n  Arreglo: en la migración que cambió los parámetros, `drop function if exists retail.<nombre>(<tipos de la firma vieja>);`" +
      "\n  antes del create (o en una migración nueva si la anterior ya corrió en producción). Ver ADR-0009 y scripts/migraciones/README.md."
  );
  process.exit(1);
}

console.log(`✓ retail: ${total} funciones, cada una con una sola firma`);
console.log("\n2/2 verificaciones en verde.");
