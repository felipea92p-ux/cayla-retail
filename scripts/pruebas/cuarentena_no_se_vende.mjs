#!/usr/bin/env node
/**
 * Prueba de PL-78: ninguna prenda de Cuarentena sale hacia una clienta — ni por venta, ni por
 * cambio, ni apartada (migración `20260924093700_cuarentena_no_se_vende.sql`).
 *
 * La escena: 5 unidades de BLU-EMMA-NEG-M entran a la Cuarentena de Tienda Trujillo (como una
 * prenda devuelta en un cambio) y 5 al piso de venta. Cada caso corre en su transacción que
 * TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * El control deshace el disparador (su «cómo se deshace») y prueba que el hueco existía: con una
 * llamada directa, `apartar_stock` aparta desde Cuarentena.
 *
 * USO: pnpm pruebas:cuarentena-no-se-vende   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20260924093700_cuarentena_no_se_vende.sql"), "utf8");
const DESHACER = "drop trigger if exists movimientos_no_salen_de_cuarentena_a_la_clienta on retail.movimientos;";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Stock de prueba en Cuarentena y en el piso; deja `:ubic`, `:v`, `:sub_cuar`, `:sub_piso`. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as sub_cuar from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_cuar', 'entrada', 5, 'cambio') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', 'entrada', 5, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
set local request.jwt.claim.sub = '${FELIPE}';
`;

/** Transacción con ROLLBACK: migración (o su reversa) → escena → cuerpo. */
const dentro = (cuerpo, { conCandado = true } = {}) =>
  psql(`begin;\n${conCandado ? MIGRACION : DESHACER}\n${ESCENA}\n${cuerpo}\nrollback;`);

const APARTAR = (sub) =>
  `select retail.apartar_stock(:'v', :'ubic', 1, 'Prueba Cuarentena', '999000111', retail.fn_hoy_lima() + 2, null, :'${sub}') is not null;`;
const SALIDA = (sub, motivo) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'${sub}', 'salida', 1, '${motivo}') returning id as ms \\gset
select retail.fn_aplicar_movimiento(:'ms') as _ap \\gset
select true;`;

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
const pasa = (sql, opciones) => () => {
  const salida = dentro(sql, opciones);
  if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
};
const rechaza = (sql) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    if (!/está en Cuarentena/.test(String(e.stderr))) throw e;
  }
};

caso("CONTROL: sin el disparador, apartar_stock SÍ aparta desde Cuarentena (el hueco existía)", pasa(APARTAR("sub_cuar"), { conCandado: false }));
caso("apartar desde Cuarentena se rechaza", rechaza(APARTAR("sub_cuar")));
caso("una salida por venta desde Cuarentena se rechaza (cualquier función, hoy o futura)", rechaza(SALIDA("sub_cuar", "venta")));
caso("una salida por cambio desde Cuarentena se rechaza", rechaza(SALIDA("sub_cuar", "cambio")));
caso("apartar desde el piso sigue funcionando", pasa(APARTAR("sub_piso")));
caso("vender desde el piso sigue funcionando", pasa(SALIDA("sub_piso", "venta")));
caso("liquidar desde Cuarentena sigue funcionando (cuarentena_liquidada)", pasa(SALIDA("sub_cuar", "cuarentena_liquidada")));
caso("la migración se puede pegar dos veces", () => {
  const n = psql(`begin;\n${MIGRACION}\n${MIGRACION}\nselect count(*) from pg_trigger where tgname = 'movimientos_no_salen_de_cuarentena_a_la_clienta';\nrollback;`);
  if (n !== "1") return `disparadores: ${n}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
