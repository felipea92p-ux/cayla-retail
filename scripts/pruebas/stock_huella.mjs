#!/usr/bin/env node
/**
 * Prueba de la huella del stock de una sede (migración `20261013153000_huella_del_stock_de_la_sede.sql`, auditoría
 * 2026-10-13, punto 20). `useStockEnVivo` deja de releer todo el stock cada 10 s si la huella no cambió, así que la
 * promesa que importa es una sola: **si cambia algo que la pantalla muestra, cambia la huella**. Si eso fallara, la caja
 * diría «agotada» de una prenda que acaban de reponer, y nadie lo notaría.
 *
 * La escena: 5 unidades de BLU-EMMA-NEG-M entran al piso de Tienda Trujillo. Cada caso corre en una transacción que
 * TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * USO: pnpm pruebas:stock-huella   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261013153000_huella_del_stock_de_la_sede.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Stock de prueba en el piso de TRU; deja `:ubic`, `:otra`, `:v`, `:sub_piso`, `:sub_alm` y la huella inicial `:h0`. */
const ESCENA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as otra from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sub_alm from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as sub_otra from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'piso_venta' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'sub_piso', 'entrada', 5, 'colchón de prueba') returning id as m0 \\gset
select retail.fn_aplicar_movimiento(:'m0') as _a0 \\gset
set local request.jwt.claim.sub = '${FELIPE}';
select retail.fn_stock_huella(:'ubic') as h0 \\gset
`;

/** Transacción con ROLLBACK: migración → escena → cuerpo. */
const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${ESCENA}\n${cuerpo}\nrollback;`);

/** Mueve `cantidad` unidades con un movimiento real (el mismo camino que una venta o una reposición). */
const MOVER = (tipo, ubic, sub, cantidad) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'${ubic}', :'${sub}', '${tipo}', ${cantidad}, 'prueba huella') returning id as mx \\gset
select retail.fn_aplicar_movimiento(:'mx') as _ax \\gset`;

let fallas = 0;
let total = 0;
function caso(nombre, sql) {
  total++;
  try {
    const salida = dentro(sql);
    if (!salida.split("\n").includes("t")) throw new Error(`salida inesperada: ${salida || "(vacía)"}`);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}

caso("la huella son 32 letras y no cambia si nada cambió", `select length(:'h0') = 32 and retail.fn_stock_huella(:'ubic') = :'h0';`);
caso("una venta (salida del piso) cambia la huella", `${MOVER("salida", "ubic", "sub_piso", 1)}\nselect retail.fn_stock_huella(:'ubic') <> :'h0';`);
caso("una reposición (entrada al piso) cambia la huella", `${MOVER("entrada", "ubic", "sub_piso", 2)}\nselect retail.fn_stock_huella(:'ubic') <> :'h0';`);
caso(
  "lo que entra al almacén de la sede cambia la huella (la caja dice «está en el almacén»)",
  `${MOVER("entrada", "ubic", "sub_alm", 1)}\nselect retail.fn_stock_huella(:'ubic') <> :'h0';`
);
caso(
  "apartar una unidad cambia la huella aunque la cantidad sea la misma",
  `select retail.apartar_stock(:'v', :'ubic', 1, 'Prueba huella', '999000111', retail.fn_hoy_lima() + 2, null, :'sub_piso') is not null as _ap \\gset
select retail.fn_stock_huella(:'ubic') <> :'h0';`
);
caso(
  "volver a la misma cantidad devuelve la misma huella (es del estado, no de un contador)",
  `${MOVER("salida", "ubic", "sub_piso", 1)}\n${MOVER("entrada", "ubic", "sub_piso", 1)}\nselect retail.fn_stock_huella(:'ubic') = :'h0';`
);
caso(
  "un cambio en OTRA sede no cambia la huella de esta",
  `${MOVER("entrada", "otra", "sub_otra", 3)}\nselect retail.fn_stock_huella(:'ubic') = :'h0';`
);
caso(
  "corre con los permisos de quien pregunta (security invoker), no con los del dueño",
  `select not prosecdef from pg_proc where oid = 'retail.fn_stock_huella(uuid)'::regprocedure;`
);
caso(
  "una cuenta con sesión puede pedirla y la respuesta coincide con la del dueño",
  `set local role authenticated;\nselect retail.fn_stock_huella(:'ubic') = :'h0';`
);
caso(
  "una visita sin sesión (anon) no puede pedirla",
  `select not has_function_privilege('anon', 'retail.fn_stock_huella(uuid)', 'execute');`
);

console.log(`\n${total - fallas}/${total} casos pasan.`);
process.exit(fallas ? 1 : 0);
