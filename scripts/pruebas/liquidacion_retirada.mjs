#!/usr/bin/env node
/**
 * Liquidación retirada (ADR-0653, reemplaza a ADR-0379) contra el Postgres local — CAYLA V2.
 *
 * Catálogo ▸ Liquidación se retiró sin haberse usado (Felipe 2026-11-13). Sus tablas y funciones quedan en la base, quietas.
 * Esta prueba vigila que de verdad estén quietas:
 *   · el módulo `liquidacion` no está en el catálogo ni en ningún rol;
 *   · `authenticated` no puede llamar a ninguna de las seis funciones que llamaba la web;
 *   · las tablas siguen ahí (no se borró lo construido);
 *   · una línea de venta que trae `pieza_liquidacion_codigo` (alguien que la manda a mano) se rechaza y no deja nada escrito;
 *   · una venta normal sigue entrando: `registrar_venta` no se tocó.
 *
 * Cada caso corre en su transacción con ROLLBACK, como Felipe (líder). No vive en vitest porque el CI no tiene Postgres.
 *
 * USO
 *   pnpm pruebas:liquidacion-retirada    → necesita el stack local (`npx supabase start`) con todas las migraciones
 *   PRUEBA_CON_MIGRACION=supabase/migrations/20261113174000_retirar_modulo_liquidacion.sql pnpm pruebas:liquidacion-retirada
 *     → la aplica dentro de cada transacción (y se deshace con el ROLLBACK): sirve para probarla antes de aplicarla.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const CENTINELA = "22222222-2222-4222-8222-222222222222";
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
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`);

/** Sede con caja abierta y una prenda de catálogo con stock. */
const FIXTURE = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as v1, retail.fn_precio_en_sede(id, :'ubic') as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;

const FUNCIONES_DE_LA_WEB = [
  "crear_pieza_liquidacion",
  "cambiar_precio_pieza_liquidacion",
  "retirar_pieza_liquidacion",
  "guardar_precio_minimo_liquidacion",
  "fn_pieza_liquidacion",
  "fn_piezas_liquidacion",
];

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

exito(
  "el módulo «liquidacion» no está en el catálogo, ni en un rol, ni oculto a un líder",
  enTransaccion(`
select (select count(*) from retail.modulos where clave = 'liquidacion'),
       (select count(*) from retail.rol_modulos where modulo = 'liquidacion'),
       (select count(*) from retail.lider_modulos_ocultos where modulo = 'liquidacion');
rollback;`),
  ([m, r, o]) => m === "0" && r === "0" && o === "0"
);

exito(
  "la web (authenticated) no puede llamar a ninguna de las seis funciones que usaba la pantalla y Vender",
  enTransaccion(`
select count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname = any (array[${FUNCIONES_DE_LA_WEB.map((f) => `'${f}'`).join(", ")}]);
rollback;`),
  ([abiertas, total]) => abiertas === "0" && total === String(FUNCIONES_DE_LA_WEB.length)
);

exito(
  "las tablas siguen ahí: no se borró lo construido",
  enTransaccion(`
select to_regclass('retail.piezas_liquidacion') is not null, to_regclass('retail.piezas_liquidacion_etiquetas') is not null,
       to_regclass('retail.parametros_liquidacion') is not null;
rollback;`),
  ([a, b, c]) => a === "t" && b === "t" && c === "t"
);

error(
  "una línea con un código LQ mandado a mano se rechaza: no hay pieza que vender",
  comoPersona(FELIPE, `${FIXTURE}
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1,
  'precio_unitario', 30, 'descuento_unitario', 0, 'descripcion_libre', 'Liquidación · prueba', 'pieza_liquidacion_codigo', 'LQ234567')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 30)), null, gen_random_uuid());
rollback;`),
  "liquidacion_no_existe"
);

exito(
  "una venta normal sigue entrando y mueve su stock: registrar_venta no se tocó",
  comoPersona(FELIPE, `${FIXTURE}
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'), 0) as antes \\gset
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1,
  'precio_unitario', :'v1_precio'::numeric, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'v1_precio'::numeric)), null, gen_random_uuid()) as venta_id \\gset
select (select count(*) from retail.venta_items where venta_id = :'venta_id'),
       :'antes'::int - coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'), 0);
rollback;`),
  ([lineas, bajo]) => lineas === "1" && bajo === "1"
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
    if (caso.tipo === "error") {
      if (r.ok) falla = `se esperaba un error ("${caso.contiene}") y no hubo ninguno`;
      else if (!r.mensaje.includes(caso.contiene)) falla = `se esperaba "${caso.contiene}", salió:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!r.ok) {
      falla = `se esperaba éxito, falló:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!caso.verificar(r.salida.split("\n").pop().split("|"))) {
      falla = `valores inesperados: ${JSON.stringify(r.salida)}`;
    }
    if (falla) fallos++;
    console.log(falla ? `✗ ${caso.nombre}\n    ${falla}` : `✓ ${caso.nombre}`);
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
