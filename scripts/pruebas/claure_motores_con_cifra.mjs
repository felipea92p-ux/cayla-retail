#!/usr/bin/env node
/**
 * Prueba CON CIFRA de lo que la actividad 6d (`20261029041000_claure_fuera_de_analisis_y_motores.sql`, ADR-0560) parchó en el motor de demanda: `fn_motor_demanda_preparacion` (el estado del
 * motor de cada sede: cuántas unidades se vendieron cada día) no cuenta lo vendido de CLAURE. Antes de esta prueba solo se comprobaba que la migración se pudiera pegar.
 *
 * Se mide por DIFERENCIA, con un control que prueba que la medida es sensible: (1) sin ninguna venta, la sede no tiene días con ventas; (2) una venta solo de CLAURE deja el resultado IGUAL que
 * sin venta; (3) la MISMA venta con una prenda de CAYLA sí aparece (el control: la medida se mueve); (4) un ticket mixto cuenta solo la línea de CAYLA; (5) sin el parche de 6d, la venta de CLAURE
 * sí contaba (la prueba deshace el reemplazo dentro de la transacción: así se ve que el parche es lo que la protege). Cada caso corre en su transacción y TERMINA EN ROLLBACK.
 *
 * Quedan SIN escena propia: `fn_plan_compra` (necesita una campaña con su plan), `fn_frescura_decisiones` (necesita decisiones de rebaja anteriores) y las dos de la vitrina (necesitan el catálogo
 * publicado): su parche es la misma línea (`and not fn_item_es_de_claure(...)`) y está en el backlog como deuda de prueba.
 *
 * USO: pnpm pruebas:claure-motores-con-cifra   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const ARCHIVO_6D = "20261029041000_claure_fuera_de_analisis_y_motores.sql";
const PREVIAS = [leer("20261029004000_cuenta_con_claure.sql")].join("\n");
const FIRMA_MOTOR = "retail.fn_motor_demanda_preparacion(uuid)";
const SIN_EL_PARCHE = sqlDeshacer(ARCHIVO_6D, [FIRMA_MOTOR], { reverso: true });
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';`;
const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;

// A = prenda de CLAURE, B = de CAYLA. `lineas` dice qué se vendió hoy en Lima: «A», «B» o «AB» (un ticket mixto: 1 de A y 2 de B). Sin ventas anteriores en la ventana: se borran las de la sede dentro de la transacción.
const escena = (lineas) => `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
reset role;
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
delete from retail.venta_items where venta_id in (select id from retail.ventas where ubicacion_id = ${LIMA});
delete from retail.ventas where ubicacion_id = ${LIMA};
${
  lineas
    ? `insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba) values (${ID("a1")}, ${LIMA}, now() - interval '1 hour', 'completada', false);
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  ${[lineas.includes("A") ? `(${ID("a1")}, :'va_a', 1, 100, 10)` : null, lineas.includes("B") ? `(${ID("a1")}, :'va_b', 2, 100, 10)` : null].filter(Boolean).join(",\n  ")};`
    : ""
}
set local session_replication_role = origin;
`;

const medir = (lineas, { sinParche = false } = {}) =>
  psql(
    `begin;\n\\o /dev/null\n${PREVIAS}\n${sinParche ? SIN_EL_PARCHE : ""}\n${ESCENA_EMPRESAS}\n${escena(lineas)}\n\\o\n${sesion(FELIPE)}\n` +
      `select coalesce((select jsonb_path_query_array(dias, '$[*].unidades')::text from retail.fn_motor_demanda_preparacion(${LIMA}) limit 1), 'sin sede');\nrollback;`,
  ).split("\n").pop();
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 12).join("\n    ")}`);
  }
}

const SIN_VENTAS = medir("");

caso("sin ventas, la sede no tiene días con unidades vendidas", () => (SIN_VENTAS === "[]" || SIN_VENTAS === "null" ? null : `se esperaba una lista vacía y salió ${SIN_VENTAS}`));

caso("una venta solo de CLAURE deja el motor igual que sin venta", () => igual(medir("A"), SIN_VENTAS));

caso("control: la misma venta con una prenda de CAYLA SÍ aparece (2 unidades hoy): la medida es sensible", () => igual(medir("B"), "[2]"));

caso("un ticket mixto cuenta solo la línea de CAYLA (2 de B, no 3)", () => igual(medir("AB"), "[2]"));

caso("sin el parche de la actividad 6d, la venta de CLAURE sí contaba (1 unidad): el parche es lo que la protege", () => igual(medir("A", { sinParche: true }), "[1]"));

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
