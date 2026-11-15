#!/usr/bin/env node
/**
 * Pruebas de «quien fija precio ve el costo; el cliente nunca» (ADR-0668, A3) — migración `20261115200000_quien_fija_precio_ve_el_costo.sql`.
 *
 * LO QUE VIGILA. Que el costo de una prenda le llegue a quien fija su precio (Productos, Recibir mercadería o Campañas, además de
 * quien ve el dinero de Compras) y a nadie más; que el resto del dinero de Compras siga cerrado para quien solo fija precios; y que
 * ninguna cuenta sin sesión ni ningún rol de mostrador lea el costo.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga DOS veces dentro de cada caso, así se prueba que se puede
 * pegar dos veces). Micaela, integrante de Trujillo, con un rol de prueba que ve SOLO los módulos que dice cada caso.
 *   P  LA PUERTA: con cada módulo, sí o no; el dinero de Compras no se abre.
 *   L  LO QUE LEE: el costo en la ficha (la hoja donde se cambia el precio) y en «Revisar precios»; la tabla de Productos, no.
 *   S  LA FORMA: las seis funciones de la hoja preguntan por la puerta nueva; la tabla de Productos y el resto del dinero de Compras
 *      siguen con su regla; la columna sigue cerrada para anon y authenticated.
 *
 * USO
 *   node scripts/pruebas/costo_quien_fija_precio.mjs                              → contra el stack local compartido
 *   node scripts/pruebas/costo_quien_fija_precio.mjs --contenedor supabase_db_x   → contra otro stack
 *   node scripts/pruebas/costo_quien_fija_precio.mjs --sin-migracion              → sin cargar la migración: contra una base sin el
 *                                                                                    cambio, la prueba tiene que FALLAR
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261115200000_quien_fija_precio_ve_el_costo.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_r text;
begin
  execute p_sql into v_r;
  return coalesce(v_r, 'NULL');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return 'ERROR ' || v_estado;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Una prenda con costo conocido: el costo que se busca en cada lectura.
select v.id as var, v.producto_id as prod from retail.variantes v join retail.productos p on p.id = v.producto_id
 where v.costo > 0 and v.activo and p.estado = 'activo' order by v.costo, v.id limit 1 \\gset
update retail.variantes set costo = 37.25 where id = :'var';
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos, y su sesión. Se va con el ROLLBACK.
const comoMicaelaCon = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba costo ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
set local role authenticated;
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

// Lo que dice la puerta, y lo que dice el dinero de Compras, para la cuenta de la sesión.
const PUERTAS = `select retail.fn_ve_costo_de_prenda()::text || ' / ' || retail.fn_puede_ver_dinero_de_compras()::text;`;
// El costo de la prenda en la ficha (fn_costos_variantes_json) y en la tabla de Productos (fn_productos_listado).
const COSTO_FICHA = `pg_temp.intento(format('select retail.fn_costos_variantes_json(array[%L]::uuid[]) ->> %L', :'var', :'var'))`;
const COSTO_TABLA = `pg_temp.intento(format('select max(costo)::text from retail.fn_productos_listado(p_por_pagina => 100) where variante_id = %L', :'var'))`;

// P. LA PUERTA -------------------------------------------------------------------------------------------------------------
caso("P1 con Productos: ve el costo de la prenda, pero el dinero de Compras sigue cerrado", `${comoMicaelaCon("productos")}${PUERTAS}`, "true / false");
caso("P2 con Recibir mercadería: ve el costo (como en Recibir desde el 2026-11-07)", `${comoMicaelaCon("recibir")}${PUERTAS}`, "true / false");
caso("P3 con Campañas: ve el costo (arma la rebaja)", `${comoMicaelaCon("campanas")}${PUERTAS}`, "true / false");
caso("P4 un rol de mostrador (Punto de venta, Caja, Existencias) no ve el costo", `${comoMicaelaCon("vender", "caja", "existencias")}${PUERTAS}`, "false / false");
caso(
  "P5 sin sesión la puerta no se puede ni preguntar",
  `reset role; set local role anon; select pg_temp.intento('select retail.fn_ve_costo_de_prenda()::text');`,
  "ERROR 42501",
);

// L. LO QUE LEE ------------------------------------------------------------------------------------------------------------
caso(
  "L1 con Productos, la ficha trae el costo de la prenda; la tabla de Productos no (se mira de pasada, también en el mostrador)",
  `${comoMicaelaCon("productos")}select ${COSTO_FICHA} || ' / ' || ${COSTO_TABLA};`,
  "37.25 / NULL",
);
caso(
  "L1b con el dinero de Compras, la tabla de Productos sigue trayendo el costo (como siempre)",
  `${comoMicaelaCon("productos", "facturas_compra")}select ${COSTO_TABLA};`,
  "37.25",
);
caso(
  "L2 un rol de mostrador no lee el costo por la ficha (vacío, nunca un 0)",
  `${comoMicaelaCon("vender", "caja")}select ${COSTO_FICHA};`,
  "NULL",
);
caso(
  "L3 con Productos, «Revisar precios» responde (antes: «tu rol no ve los costos»)",
  `${comoMicaelaCon("productos")}select case when pg_temp.intento('select count(*)::text from retail.fn_precios_a_revisar()') like 'ERROR%' then 'rechazó' else 'responde' end;`,
  "responde",
);
caso(
  "L4 nadie con sesión lee la columna del costo directo de la tabla",
  `${comoMicaelaCon("productos")}select pg_temp.intento(format('select costo::text from retail.variantes where id = %L', :'var'));`,
  "ERROR 42501",
);

// S. LA FORMA --------------------------------------------------------------------------------------------------------------
caso(
  "S1 las seis funciones de la hoja donde se fija el precio preguntan por la puerta nueva y ya no por el dinero de Compras",
  `reset role;
   select string_agg(p.proname || ':' || (position('fn_ve_costo_de_prenda' in pg_get_functiondef(p.oid)) > 0)::text
                     || ':' || (position('fn_puede_ver_dinero_de_compras' in pg_get_functiondef(p.oid)) > 0)::text, ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f' and p.proname in (
       'fn_costos_variantes_json', 'fn_costo_de_la_prenda', 'fn_costo_de_las_tallas', 'catalogo_actualizar_producto',
       'fn_precios_a_revisar', 'aplicar_precio_propuesto');`,
  [
    "aplicar_precio_propuesto",
    "catalogo_actualizar_producto",
    "fn_costo_de_la_prenda",
    "fn_costo_de_las_tallas",
    "fn_costos_variantes_json",
    "fn_precios_a_revisar",
  ]
    .map((f) => `${f}:true:false`)
    .join(","),
);
caso(
  "S2 la tabla de Productos y lo demás del dinero de Compras no cambiaron: siguen con su regla",
  `reset role;
   select string_agg(p.proname || ':' || (position('fn_puede_ver_dinero_de_compras' in pg_get_functiondef(p.oid)) > 0)::text, ',' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f'
      and p.proname in ('fn_productos_listado', 'fn_productos_facetas', 'fn_productos_filtro', 'fn_valor_inventario_existencias', 'fn_historial_prenda');`,
  "fn_historial_prenda:true,fn_productos_facetas:true,fn_productos_filtro:true,fn_productos_listado:true,fn_valor_inventario_existencias:true",
);
caso(
  "S3 la puerta es de la base: authenticated la pregunta, anon no",
  `reset role;
   select has_function_privilege('authenticated', 'retail.fn_ve_costo_de_prenda()', 'execute')::text || ' / '
       || has_function_privilege('anon', 'retail.fn_ve_costo_de_prenda()', 'execute')::text;`,
  "true / false",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
