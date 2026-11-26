#!/usr/bin/env node
/**
 * Prueba de «Compras reestructurado» (ADR-0704): `20261126152000_compras_compradores_y_todas_las_compras.sql`.
 *
 * QUÉ PROMETE
 *   · Sin el módulo, ninguna de las dos lecturas responde (42501): `fn_compradores` pide «fondos» y `fn_todas_las_compras`, «facturas_compra».
 *   · Compradores trae la ronda con TODAS sus compras, revisadas o no, y su cuenta.
 *   · Todas las compras: una compra de «Mis compras» entra recién cuando sale en un envío (decisión de Felipe, 2026-11-26); al revisarla,
 *     su comprobante va en la misma fila (nunca dos veces). Un comprobante de la oficina entra como fila propia y se va al filtrar por persona.
 *   · Pegar la migración dos veces no rompe nada.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, filas escritas directo en las tablas y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-compradores                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_compradores.mjs --contenedor <otro>  → contra otro contenedor
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
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261126152000_compras_compradores_y_todas_las_compras.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todo
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo: sin Compras

const como = (auth) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const SQL = `
set client_min_messages = warning;
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'OK';
exception when others then
  return sqlstate;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;

-- Compra Micaela (no hace falta que vea Compras: anota desde su celular).
select id as compradora from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into retail.proveedores (nombre) values ('Proveedor Compradores Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Oficina Compradores Prueba') returning id as prov2 \\gset
select id as tru from retail.ubicaciones where nombre ilike '%trujillo%' order by nombre limit 1 \\gset
update retail.compra_rondas set cerrada_en = now() where persona_id = :'compradora' and cerrada_en is null;
insert into retail.compra_rondas (persona_id, abierta_por) values (:'compradora', :'compradora') returning id as ronda \\gset
-- Dos compras de Micaela: la primera sale en un envío, la segunda todavía no.
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, fecha, huella, registrado_por, pagado, medio_pago, ronda_id)
values (gen_random_uuid(), :'compradora', :'prov', 'boleta', 300, current_date, 'h1', :'compradora', 300, 'yape', :'ronda') returning id as p1 \\gset
insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, fecha, huella, registrado_por, pagado, medio_pago, ronda_id)
values (gen_random_uuid(), :'compradora', :'prov', 'nota_venta', 120, current_date, 'h2', :'compradora', 0, null, :'ronda') returning id as p2 \\gset
insert into retail.ordenes_compra (proveedor_id, creada_por, papel_id) values (:'prov', :'compradora', :'p1') returning id as o1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, cantidad, precio_unitario, descripcion) values (:'o1', 1, 6, 50, 'Polo prueba') returning id as i1 \\gset
insert into retail.ordenes_compra (proveedor_id, creada_por, papel_id) values (:'prov', :'compradora', :'p2') returning id as o2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, cantidad, precio_unitario, descripcion) values (:'o2', 1, 4, 30, 'Falda prueba');
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', :'compradora') returning id as d1 \\gset
insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, precio_unitario) values (:'d1', :'i1', 6, 50);
-- Un comprobante que registró la oficina, sin compra de «Mis compras» detrás.
insert into retail.compras (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total, naturaleza, fecha_emision, ubicacion_gestion_id)
values (:'prov2', 'factura', 'F001', '777001', 'contado', 100, 18, 118, 'mercaderia', current_date, :'tru');

\\echo ==sin-modulo
${como(MICAELA)}
select pg_temp.intento('select retail.fn_compradores()'), pg_temp.intento('select retail.fn_todas_las_compras()');

\\echo ==compradores
${como(FELIPE)}
select jsonb_array_length(r -> 'compras'), (r -> 'cuenta' ->> 'compraste')::numeric, r ->> 'persona_id' = :'compradora'
  from jsonb_array_elements(retail.fn_compradores()) r where r ->> 'id' = :'ronda';

\\echo ==todas-antes
select count(*) filter (where x ->> 'id' = :'p1'), count(*) filter (where x ->> 'id' = :'p2'),
       count(*) filter (where x ->> 'proveedor_id' = :'prov2' and x ->> 'origen' = 'comprobante')
  from jsonb_array_elements(retail.fn_todas_las_compras()) x;

-- Se revisa la primera: nace su comprobante, enlazado por token_cliente.
reset role;
insert into retail.compras (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total, naturaleza, fecha_emision, token_cliente, ubicacion_gestion_id)
values (:'prov', 'boleta', 'B001', '888001', 'contado', 300, 0, 300, 'mercaderia', current_date, :'p1', :'tru');
update retail.compra_papeles set estado = 'completado' where id = :'p1';

\\echo ==todas-despues
${como(FELIPE)}
select count(*) filter (where x ->> 'id' = :'p1'), count(*) filter (where x -> 'comprobante' ->> 'documento' like '%888001%'),
       bool_and((x ->> 'revisada')::boolean) filter (where x ->> 'id' = :'p1')
  from jsonb_array_elements(retail.fn_todas_las_compras()) x;

\\echo ==por-persona
select count(*) filter (where x ->> 'origen' = 'comprobante'), count(*) filter (where x ->> 'id' = :'p1')
  from jsonb_array_elements(retail.fn_todas_las_compras(p_persona => :'compradora')) x;
rollback;
`;

const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
  input: SQL,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

const bloques = {};
let actual = null;
for (const linea of salida.split("\n")) {
  if (linea.startsWith("==")) actual = bloques[linea.slice(2)] = [];
  else if (actual && linea.trim()) actual.push(linea.trim());
}

const casos = [
  ["sin el módulo, las dos lecturas dicen 42501", bloques["sin-modulo"]?.[0], "42501|42501"],
  ["Compradores trae las dos compras de la ronda y lo pagado", bloques["compradores"]?.[0], "2|300.00|t"],
  ["antes de revisar: entra la enviada, no la que no salió, y el comprobante de la oficina", bloques["todas-antes"]?.[0], "1|0|1"],
  ["revisada: sigue una sola fila, con su comprobante", bloques["todas-despues"]?.[0], "1|1|t"],
  ["por persona: sin lo de la oficina, con lo suyo", bloques["por-persona"]?.[0], "0|1"],
];

let fallas = 0;
for (const [nombre, obtenido, esperado] of casos) {
  const ok = obtenido === esperado;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${ok ? "" : ` — esperaba «${esperado}», salió «${obtenido}»`}`);
}
if (fallas > 0) {
  console.error(`\n${fallas} de ${casos.length} fallaron.`);
  process.exit(1);
}
console.log(`\n${casos.length} de ${casos.length} pasan.`);
