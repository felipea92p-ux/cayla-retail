#!/usr/bin/env node
/**
 * Órdenes de insumos retirada (ADR-0702, retira la fase 7 de ADR-0362) contra el Postgres local — CAYLA V2.
 *
 * Producción ▸ Abastecimiento ▸ «Órdenes de insumos» se retiró sin haberse usado (Felipe 2026-11-25). Sus tablas y funciones quedan en
 * la base, quietas. Esta prueba vigila que de verdad estén quietas y que lo que se queda siga andando:
 *   · el módulo `ordenes_insumos` no está en el catálogo, ni en un rol, ni oculto a un líder;
 *   · `authenticated` no puede llamar a ninguna de las nueve funciones que llamaba la pantalla;
 *   · las cinco tablas siguen ahí (no se borró lo construido);
 *   · `fn_ordenes_insumo_nos_debe` (el aviso de faltantes de Facturas de insumos, Por pagar y Finanzas) pide el módulo de Producción y
 *     le contesta al líder, en vez de fallar por un módulo que ya no existe;
 *   · `recibir_comprobante_produccion` y `registrar_comprobante_produccion` (los usan «Llegó una compra» y «Pagar servicio») siguen abiertos.
 *
 * Reemplaza a pruebas:ordenes-insumo, pruebas:comprobante-orden-insumo y pruebas:recepcion-orden-insumo: sin el módulo, la base ya no
 * deja crear una orden desde la web, que era lo que probaban.
 *
 * Cada caso corre en su transacción con ROLLBACK, como Felipe (líder). No vive en vitest porque el CI no tiene Postgres.
 *
 * USO
 *   pnpm pruebas:ordenes-insumo-retirada    → necesita el stack local (`npx supabase start`) con todas las migraciones
 *   PRUEBA_CON_MIGRACION=supabase/migrations/20261125231000_retirar_modulo_ordenes_insumos.sql pnpm pruebas:ordenes-insumo-retirada
 *     → la aplica dentro de cada transacción (y se deshace con el ROLLBACK): sirve para probarla antes de aplicarla.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MIGRACION = process.env.PRUEBA_CON_MIGRACION
  ? readFileSync(process.env.PRUEBA_CON_MIGRACION, "utf8").replace(/^notify .*$/gm, "")
  : "";

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

const enTransaccion = (sql) => `
begin;
${MIGRACION}
reset search_path;
${sql}
`;

const comoPersona = (authUserId, sql) =>
  enTransaccion(`
set local role authenticated;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`);

const FUNCIONES_DE_LA_WEB = [
  "crear_orden_insumo",
  "editar_orden_insumo",
  "anular_orden_insumo",
  "fn_ordenes_insumo",
  "fn_orden_insumo",
  "fn_orden_insumo_opciones",
  "fn_ordenes_insumo_siguiente",
  "registrar_comprobante_orden_insumo",
  "recibir_orden_insumo",
];
const lista = (fs) => fs.map((f) => `'${f}'`).join(", ");

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, sql, verificar });

exito(
  "el módulo «ordenes_insumos» no está en el catálogo, ni en un rol, ni oculto a un líder",
  enTransaccion(`
select (select count(*) from retail.modulos where clave = 'ordenes_insumos'),
       (select count(*) from retail.rol_modulos where modulo = 'ordenes_insumos'),
       (select count(*) from retail.lider_modulos_ocultos where modulo = 'ordenes_insumos');
rollback;`),
  ([m, r, o]) => m === "0" && r === "0" && o === "0"
);

exito(
  "la web (authenticated) no puede llamar a ninguna de las nueve funciones que usaba la pantalla",
  enTransaccion(`
select count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname = any (array[${lista(FUNCIONES_DE_LA_WEB)}]);
rollback;`),
  ([abiertas, total]) => abiertas === "0" && total === String(FUNCIONES_DE_LA_WEB.length)
);

exito(
  "las cinco tablas siguen ahí: no se borró lo construido",
  enTransaccion(`
select count(*) from unnest(array['retail.ordenes_insumo', 'retail.orden_insumo_items', 'retail.orden_insumo_recepciones',
  'retail.orden_insumo_cierres', 'retail.orden_insumo_versiones']) t where to_regclass(t) is not null;
rollback;`),
  ([n]) => n === "5"
);

exito(
  "el aviso de faltantes (fn_ordenes_insumo_nos_debe) pide Producción y le contesta al líder",
  comoPersona(FELIPE, `
select position('fn_ve_modulo(''produccion'')' in pg_get_functiondef('retail.fn_ordenes_insumo_nos_debe(uuid[])'::regprocedure)) > 0,
       (select count(*) from retail.fn_ordenes_insumo_nos_debe(array[gen_random_uuid()]));
rollback;`),
  ([pide, filas]) => pide === "t" && filas === "0"
);

exito(
  "«Llegó una compra» y «Pagar servicio» siguen pudiendo registrar y recibir su factura",
  enTransaccion(`
select count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('recibir_comprobante_produccion', 'registrar_comprobante_produccion', 'registrar_compra_de_insumos');
rollback;`),
  ([abiertas]) => Number(abiertas) >= 3
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    let falla = null;
    if (!r.ok) falla = `se esperaba éxito, falló:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    else if (!caso.verificar(r.salida.split("\n").pop().split("|"))) falla = `valores inesperados: ${JSON.stringify(r.salida)}`;
    if (falla) fallos++;
    console.log(falla ? `✗ ${caso.nombre}\n    ${falla}` : `✓ ${caso.nombre}`);
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
