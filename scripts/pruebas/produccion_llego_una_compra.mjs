#!/usr/bin/env node
/**
 * Pruebas de «Llegó una compra» (ADR-0614, actividad 5) — migración `20261105223000_llego_una_compra.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que varias líneas dejen un comprobante y un lote por línea, todo o nada; que la deuda y el pago sean los de siempre; que la nota de cada lote se guarde;
 * que un mismo insumo no entre dos veces; que el token no repita; y que quien no es líder no pueda.
 *
 * USO
 *   node scripts/pruebas/produccion_llego_una_compra.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_llego_una_compra.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_llego_una_compra.mjs --base otra                 → contra otra base del mismo contenedor
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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105223000_llego_una_compra.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;


const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado || ':' || v_msg);
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Telas Prueba Compra', 'tela') returning id as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('LC-A', 'Tela A prueba', 'tela', 'metro') returning id as a \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('LC-B', 'Botón B prueba', 'avio', 'unidad') returning id as b \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
${como(FELIPE)}
`;

const LINEAS = `jsonb_build_array(
  jsonb_build_object('insumo_id', :'a', 'cantidad', '347', 'costo_unitario', '5.1873', 'nota', '100 kg × 3.47 m/kg', 'codigo_lote', 'R-1'),
  jsonb_build_object('insumo_id', :'b', 'cantidad', '200', 'costo_unitario', '0.25'))`;
const LLAMA = (extra, lineas = LINEAS) => `retail.registrar_compra_de_insumos(:'taller', :'prov', ${lineas}${extra})`;
const CREDITO = `, p_tipo => 'factura', p_serie => 'F001', p_numero => '55', p_condicion => 'credito', p_fecha_vencimiento => retail.fn_hoy_lima() + 30`;
const COMP = `(select c.id from retail.comprobantes_produccion c where c.proveedor_id = :'prov' order by c.created_at desc limit 1)`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}
/** Corre la llamada y deja su resultado en :r; un rechazo devuelve su hint. */
const CORRE = (extra, lineas = LINEAS, como_ = "r") => `create or replace function pg_temp.llama_${como_}(p_taller uuid, p_prov uuid, p_a uuid, p_b uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := ${LLAMA(extra, lineas).replace(/:'taller'/g, "p_taller").replace(/:'prov'/g, "p_prov").replace(/:'a'/g, "p_a").replace(/:'b'/g, "p_b")};
  return 'OK:' || coalesce(v_r ->> 'repetido', '');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado || ':' || v_msg);
end;
$f$;
select pg_temp.llama_${como_}(:'taller', :'prov', :'a', :'b') as ${como_} \\gset`;

caso(
  "M1 se vuelve a cargar sin error y la llama la cuenta, no quien no entró",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_function_privilege('authenticated', 'retail.registrar_compra_de_insumos(uuid,uuid,jsonb,text,text,text,boolean,text,date,date,numeric,jsonb,text,uuid,numeric)', 'execute'),
     has_function_privilege('anon', 'retail.registrar_compra_de_insumos(uuid,uuid,jsonb,text,text,text,boolean,text,date,date,numeric,jsonb,text,uuid,numeric)', 'execute'));`,
  "t,f"
);
caso(
  "C1 dos líneas: un comprobante, dos lotes con su proveedor y su costo, y la deuda queda en Por pagar",
  `${CORRE(CREDITO)}
   select concat_ws(',', :'r',
     (select count(*) from retail.comprobantes_produccion_items where comprobante_id = ${COMP}),
     (select concat_ws('/', c.condicion, c.subtotal, c.igv, c.total) from retail.comprobantes_produccion c where c.id = ${COMP}),
     (select count(*) from retail.insumo_lotes l where l.proveedor_id = :'prov'),
     (select l.cantidad_ingresada || '/' || l.costo_unitario from retail.insumo_lotes l where l.insumo_id = :'a'),
     (select c.saldo from retail.fn_comprobantes_produccion(5) c where c.id = ${COMP}));`,
  "OK:false,2,credito/1849.99/333.00/2182.99,2,347.000/5.1873,2182.99"
);
caso(
  "N1 cada lote guarda su nota y su código; sin nota, la de la compra",
  `${CORRE(CREDITO + ", p_nota => 'de la compra'")}
   select concat_ws(',', (select l.nota || '|' || l.codigo_lote from retail.insumo_lotes l where l.insumo_id = :'a'),
     (select l.nota from retail.insumo_lotes l where l.insumo_id = :'b'));`,
  "100 kg × 3.47 m/kg|R-1,de la compra"
);
caso(
  "S1 el stock de cada insumo sube por su lote",
  `${CORRE(CREDITO)}
   select concat_ws(',', (select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_id = :'a' and m.tipo = 'compra'),
     (select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_id = :'b' and m.tipo = 'compra'));`,
  "347.000,200.000"
);
caso(
  "P1 al contado deja su pago por el total del papel: los centavos que pierde pasar kilos a metros no cambian lo que se debe",
  `${CORRE(", p_tipo => 'factura', p_serie => 'F001', p_numero => '56', p_condicion => 'contado', p_total => 2183.00, p_pago => jsonb_build_array(jsonb_build_object('metodo', 'transferencia', 'monto', '2183.00'))")}
   select concat_ws(',', :'r', (select c.saldo from retail.fn_comprobantes_produccion(5) c where c.id = ${COMP}), (select sum(g.monto) from retail.comprobantes_produccion_pagos g where g.comprobante_id = ${COMP}));`,
  "OK:false,0.00,2183.00"
);
caso(
  "V1 sin papel: nota de venta provisional S/P, sin IGV",
  `${CORRE(", p_sin_papel => true, p_condicion => 'credito', p_fecha_vencimiento => retail.fn_hoy_lima() + 30")}
   select concat_ws(',', :'r', (select concat_ws('/', c.tipo, c.serie, c.numero, c.igv, c.total) from retail.comprobantes_produccion c where c.id = ${COMP}));`,
  "OK:false,nota_venta/S/P/000001/0.00/1849.99"
);
caso(
  "E1 sin líneas se rechaza",
  `${CORRE(CREDITO, "'[]'::jsonb")}
   select :'r';`,
  "compra_sin_lineas"
);
caso(
  "E2 un mismo insumo dos veces se rechaza, sin dejar nada",
  `${CORRE(CREDITO, `jsonb_build_array(jsonb_build_object('insumo_id', :'a', 'cantidad', '1', 'costo_unitario', '1'), jsonb_build_object('insumo_id', :'a', 'cantidad', '2', 'costo_unitario', '2'))`)}
   select concat_ws(',', :'r', (select count(*) from retail.insumo_lotes where insumo_id = :'a'));`,
  "compra_insumo_repetido,0"
);
caso(
  "E3 si una línea falla, no queda nada: ni comprobante ni el otro lote",
  `${CORRE(CREDITO, `jsonb_build_array(jsonb_build_object('insumo_id', :'a', 'cantidad', '10', 'costo_unitario', '1'), jsonb_build_object('insumo_id', :'b', 'cantidad', '0', 'costo_unitario', '1'))`)}
   select concat_ws(',', (:'r' not like 'OK%'), (select count(*) from retail.comprobantes_produccion where proveedor_id = :'prov'), (select count(*) from retail.insumo_lotes where proveedor_id = :'prov'));`,
  "t,0,0"
);
caso(
  "T1 el mismo token no repite; con otro contenido se rechaza",
  `select gen_random_uuid() as tk \\gset
   select set_config('prueba.tk', :'tk', true) as _t \\gset
   ${CORRE(CREDITO + ", p_token => current_setting('prueba.tk')::uuid", LINEAS, "r1")}
   ${CORRE(CREDITO + ", p_token => current_setting('prueba.tk')::uuid", LINEAS, "r2")}
   ${CORRE(", p_tipo => 'factura', p_serie => 'F001', p_numero => '99', p_condicion => 'credito', p_fecha_vencimiento => retail.fn_hoy_lima() + 30, p_token => current_setting('prueba.tk')::uuid", LINEAS, "r3")}
   select concat_ws(',', :'r1', :'r2', :'r3', (select count(*) from retail.insumo_lotes where proveedor_id = :'prov'));`,
  "OK:false,OK:true,token_reusado,2"
);
caso(
  "Q1 quien no es líder no compra",
  `${como(MICAELA)}
   ${CORRE(CREDITO)}
   select concat_ws(',', (:'r' not like 'OK%'), (select count(*) from retail.comprobantes_produccion where proveedor_id = :'prov'));`,
  "t,0"
);
caso(
  "A1 la compra de una línea de antes sigue funcionando, ahora por la misma puerta",
  `select (retail.recibir_insumo_comprado(:'a', :'taller', :'prov', 10::numeric, 5::numeric, 'boleta', 'B1', '7', false, 'credito', null, retail.fn_hoy_lima() + 5) ->> 'repetido') as r \\gset
   select concat_ws(',', :'r', (select count(*) from retail.insumo_lotes where proveedor_id = :'prov'));`,
  "false,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
