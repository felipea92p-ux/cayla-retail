#!/usr/bin/env node
/**
 * Prueba de la regla del «costo atípico» (Felipe, 2026-09-30) contra el Postgres LOCAL:
 * migración `20260930120000_costo_fuera_de_banda.sql`, función pura `retail.fn_costo_fuera_de_banda`.
 *
 * QUÉ CUBRE
 *   1. Los cuatro motivos, cada uno con su frontera exacta: justo 2× pasa y 2,01× sube; justo 2/3 pasa y por debajo baja;
 *      cero y negativo son 'sin_costo'; costo igual al precio es 'mayor_que_precio'.
 *   2. Sin referencia no hay opinión relativa: sin costo vigente (0 o NULL) solo valen el cero y el precio; sin precio,
 *      solo la banda contra el vigente; un costo nuevo NULL (lote sin costo) no es un costo y devuelve NULL.
 *   3. El orden de los motivos (el primero que aplica gana): un costo que es a la vez «mayor que el precio» y «sube»
 *      dice 'mayor_que_precio'.
 *   4. Los errores de tecleo que motivaron la regla: una cifra ×10 sube, una cifra ÷10 baja.
 *   5. Es pura (immutable) e interna: ni `anon` ni `authenticated` la ejecutan, aunque las funciones SECURITY DEFINER que
 *      la llaman sí (corren como su dueño).
 *   6. La migración se puede pegar dos veces.
 *
 * CÓMO. La función no lee tablas, así que no hace falta escena: un `select` por caso, y ningún caso escribe nada.
 *
 * USO
 *   pnpm pruebas:costo-fuera-de-banda    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260930120000_costo_fuera_de_banda.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}

/** Lo que devuelve la regla para (costo nuevo, costo vigente, precio); 'ok' si pasa (NULL). */
const regla = (nuevo, vigente, precio) => {
  const lit = (v) => (v === null ? "null::numeric" : `${v}::numeric`);
  const salida = psql(`select coalesce(retail.fn_costo_fuera_de_banda(${lit(nuevo)}, ${lit(vigente)}, ${lit(precio)}), 'ok');`);
  return salida.split("\n").at(-1);
};

// [nombre, nuevo, vigente, precio, esperado]. Referencia de la mayoría: una prenda de costo 58 y precio 99.
const CASOS = [
  ["un costo igual al vigente pasa", 58, 58, 99, "ok"],
  ["justo 2× el vigente pasa (la comparación es estricta)", 116, 58, 200, "ok"],
  ["más de 2× el vigente sube", 116.01, 58, 200, "sube"],
  ["justo 2/3 del vigente pasa", 38.67, 58, 99, "ok"], // 38,67 × 3 = 116,01 > 116 = 58 × 2
  ["por debajo de 2/3 del vigente baja", 38.66, 58, 99, "baja"], // 38,66 × 3 = 115,98 < 116
  ["justo el vigente de costo 60 y su 2/3 exacto (40) pasa", 40, 60, 99, "ok"],
  ["un centavo bajo el 2/3 exacto baja", 39.99, 60, 99, "baja"],
  ["costo cero es 'sin_costo'", 0, 58, 99, "sin_costo"],
  ["costo negativo es 'sin_costo'", -1, 58, 99, "sin_costo"],
  ["costo cero sin referencia alguna también es 'sin_costo'", 0, null, null, "sin_costo"],
  ["costo igual al precio es 'mayor_que_precio'", 99, 90, 99, "mayor_que_precio"],
  ["un centavo bajo el precio (y dentro de la banda) pasa", 98.99, 90, 99, "ok"],
  ["costo mayor que el precio, sin costo vigente, es 'mayor_que_precio'", 120, 0, 99, "mayor_que_precio"],
  ["sin costo vigente (0) y dentro del precio no hay opinión: pasa", 30, 0, 99, "ok"],
  ["sin costo vigente (NULL) y dentro del precio no hay opinión: pasa", 30, null, 99, "ok"],
  ["sin precio (0), solo cuenta la banda contra el vigente: sube", 500, 58, 0, "sube"],
  ["sin precio (NULL), solo cuenta la banda contra el vigente: baja", 5, 58, null, "baja"],
  ["sin precio ni vigente no hay opinión: pasa", 500, null, null, "ok"],
  ["un costo nuevo NULL (lote sin costo) no es un costo: pasa", null, 58, 99, "ok"],
  ["el orden: a la vez «mayor que el precio» y «sube», gana 'mayor_que_precio'", 300, 58, 99, "mayor_que_precio"],
  ["el orden: a la vez «sin costo» y dentro de todo lo demás, gana 'sin_costo'", 0, 58, 99, "sin_costo"],
  ["el error que motivó la regla: un dígito de más (580 en vez de 58) sube", 580, 58, 1000, "sube"],
  ["el error que motivó la regla: un dígito de menos (5,8 en vez de 58) baja", 5.8, 58, 99, "baja"],
];
for (const [nombre, nuevo, vigente, precio, esperado] of CASOS) {
  caso(nombre, () => {
    const obtenido = regla(nuevo, vigente, precio);
    if (obtenido !== esperado) return `(${nuevo}, ${vigente}, ${precio}) → ${obtenido}, esperado ${esperado}`;
  });
}

caso("es pura: la marca la base como immutable", () => {
  const salida = psql(`select provolatile from pg_proc where oid = 'retail.fn_costo_fuera_de_banda(numeric, numeric, numeric)'::regprocedure;`);
  if (salida !== "i") return `provolatile: ${salida}`;
});

caso("anon y authenticated no la ejecutan", () => {
  const salida = psql(`select has_function_privilege('anon', 'retail.fn_costo_fuera_de_banda(numeric, numeric, numeric)', 'execute')::text
       || ',' || has_function_privilege('authenticated', 'retail.fn_costo_fuera_de_banda(numeric, numeric, numeric)', 'execute')::text;`);
  if (salida !== "false,false") return salida;
});

caso("…y una sesión de la API que la llama recibe permiso denegado", () => {
  let error = "";
  try {
    psql(`begin; set local role authenticated; select retail.fn_costo_fuera_de_banda(1, 1, 1); rollback;`);
  } catch (e) {
    error = String(e.stderr ?? e.message);
  }
  if (!/permission denied|permiso denegado/i.test(error)) return `debía rechazarla: ${error || "(pasó)"}`;
});

caso("una función SECURITY DEFINER sí la puede llamar (así la usarán los caminos que escriben el costo)", () => {
  const salida = psql(`begin;
create function pg_temp.via_definer() returns text language sql security definer as $f$
  select retail.fn_costo_fuera_de_banda(580, 58, 1000);
$f$;
grant execute on function pg_temp.via_definer() to authenticated;
set local role authenticated;
select pg_temp.via_definer();
rollback;`);
  if (salida.split("\n").at(-1) !== "sube") return salida;
});

caso("la migración se puede pegar dos veces", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'fn_costo_fuera_de_banda' and pronamespace = 'retail'::regnamespace;
rollback;`);
  if (salida.split("\n").at(-1) !== "1") return salida;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
