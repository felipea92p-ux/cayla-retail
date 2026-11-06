#!/usr/bin/env node
/**
 * Pruebas de «regularizar lo que ya entró» (ADR-0614, actividades 6 y 7) — migración `20261105225000_regularizar_lotes_y_papeles.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que a un lote de compra se le complete el proveedor; que el papel provisional se reemplace con sus lotes; y que lo que queda de un lote usado baje como
 * merma, con el saldo del lote y el del libro cuadrados. Que todo lo rechazado no deje nada, y que solo un líder pueda.
 *
 * USO: node scripts/pruebas/produccion_regularizar_lotes.mjs [--contenedor supabase_db_x] [--base otra]
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105225000_regularizar_lotes_y_papeles.sql"), "utf8"));

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

const LOTE_SIN_PROVEEDOR = `select retail.recibir_insumo(:'a', :'taller', 10::numeric, 50::numeric, p_origen => 'compra') as _l \\gset
   select id as lote from retail.insumo_lotes where insumo_id = :'a' \\gset`;
const COMPRA_SP = `select retail.registrar_compra_de_insumos(:'taller', :'prov', jsonb_build_array(jsonb_build_object('insumo_id', :'a', 'cantidad', '10', 'costo_unitario', '10')), p_sin_papel => true, p_condicion => 'credito', p_fecha_vencimiento => retail.fn_hoy_lima() + 5) ->> 'comprobante_id' as comp \\gset`;
const INT = (sql) => `pg_temp.intento(format(${sql}))`;
const REEMPLAZA = (tipo, serie, numero, total = "null") => INT(`'select retail.reemplazar_papel_provisional(%L, %L, %L, %L, retail.fn_hoy_lima(), ${total})', :'comp', '${tipo}', '${serie}', '${numero}'`);
const AJUSTA = (vio, queda, motivo = "Conteo del estante") => INT(`'select retail.ajustar_lote_usado(%L, ${vio}, ${queda}, %L)', :'lote', '${motivo}'`);
/** Un lote de compra de 10 m del que ya salieron 4 (una merma cuenta como uso). */
const LOTE_USADO = `${LOTE_SIN_PROVEEDOR}
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, nota) values (:'a', :'lote', :'taller', 'merma', 4, 5, 'uso de prueba');`;
const SALDO_LOTE = `(select l.cantidad_ingresada - coalesce((select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo in ('consumo','merma')),0) + coalesce((select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo='devolucion'),0) from retail.insumo_lotes l where l.id = :'lote')`;
const SALDO_LIBRO = `(select sum(case m.tipo when 'compra' then m.cantidad when 'devolucion' then m.cantidad when 'consumo' then -m.cantidad when 'merma' then -m.cantidad else m.cantidad end) from retail.movimientos_insumo m where m.insumo_id = :'a')`;

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

caso(
  "M1 se vuelve a cargar sin error; la cuenta las llama, quien no entró no",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_function_privilege('authenticated', 'retail.ajustar_lote_usado(uuid,numeric,numeric,text)', 'execute'), has_function_privilege('anon', 'retail.reemplazar_papel_provisional(uuid,text,text,text,date,numeric)', 'execute'));`,
  "t,f"
);
caso(
  "L1 a un lote de compra sin proveedor se le completa, sin crear deuda, y queda en su historia",
  `${LOTE_SIN_PROVEEDOR}
   select ${INT(`'select retail.asignar_proveedor_a_lote(%L, %L)', :'lote', :'prov'`)} as r \\gset
   select concat_ws(',', :'r', (select proveedor_id = :'prov' from retail.insumo_lotes where id = :'lote'),
     (select count(*) from retail.comprobantes_produccion where proveedor_id = :'prov'),
     (select count(*) from retail.insumo_lote_cambios where insumo_lote_id = :'lote' and accion = 'proveedor'));`,
  "OK,t,0,1"
);
caso(
  "L2 a un lote que ya tiene proveedor no se le cambia",
  `${LOTE_SIN_PROVEEDOR}
   select ${INT(`'select retail.asignar_proveedor_a_lote(%L, %L)', :'lote', :'prov'`)} as r \\gset
   select ${INT(`'select retail.asignar_proveedor_a_lote(%L, %L)', :'lote', :'prov'`)};`,
  "lote_ya_tiene_proveedor"
);
caso(
  "L3 un saldo inicial no tiene a quién se le compró",
  `select retail.recibir_insumo(:'a', :'taller', 10::numeric, 50::numeric, p_origen => 'saldo_inicial') as _l \\gset
   select id as lote from retail.insumo_lotes where insumo_id = :'a' \\gset
   select ${INT(`'select retail.asignar_proveedor_a_lote(%L, %L)', :'lote', :'prov'`)};`,
  "lote_no_es_compra"
);
caso(
  "P1 la factura que llegó después reemplaza a S/P: tipo, número, IGV y documento del lote",
  `${COMPRA_SP}
   select ${REEMPLAZA("factura", "F001", "77")} as r \\gset
   select concat_ws(',', :'r', (select concat_ws('/', tipo, serie, numero, subtotal, igv, total) from retail.comprobantes_produccion where id = :'comp'),
     (select documento from retail.insumo_lotes where insumo_id = :'a'));`,
  "OK,factura/F001/77/100.00/18.00/118.00,F001-77"
);
caso(
  "P2 una boleta queda con el mismo total",
  `${COMPRA_SP}
   select ${REEMPLAZA("boleta", "B1", "9")} as r \\gset
   select concat_ws(',', :'r', (select concat_ws('/', tipo, igv, total) from retail.comprobantes_produccion where id = :'comp'));`,
  "OK,boleta/0.00/100.00"
);
caso(
  "P3 una factura con un total fuera de lo posible se rechaza, y no queda nada",
  `${COMPRA_SP}
   select ${REEMPLAZA("factura", "F001", "78", "200")} as r \\gset
   select concat_ws(',', :'r', (select serie from retail.comprobantes_produccion where id = :'comp'));`,
  "papel_total_invalido,S/P"
);
caso(
  "P4 un papel que no es provisional no se reemplaza",
  `${COMPRA_SP}
   select ${REEMPLAZA("factura", "F001", "79")} as a \\gset
   select ${REEMPLAZA("factura", "F001", "80")};`,
  "papel_no_es_provisional"
);
caso(
  "P5 un papel ya registrado de ese proveedor se rechaza",
  `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total) values (:'prov', 'factura', 'F001', '81', 'credito', retail.fn_hoy_lima() + 3, 10, 0, 10);
   ${COMPRA_SP}
   select ${REEMPLAZA("factura", "F001", "81")};`,
  "papel_repetido"
);
caso(
  "A1 lo que queda baja como merma: el lote y el libro quedan iguales, y lo que entró no se toca",
  `${LOTE_USADO}
   select ${AJUSTA(6, 2.5)} as r \\gset
   select concat_ws(',', :'r', ${SALDO_LOTE}, ${SALDO_LIBRO}, (select cantidad_ingresada from retail.insumo_lotes where id = :'lote'),
     (select count(*) from retail.insumo_lote_cambios where insumo_lote_id = :'lote' and accion = 'ajustar'));`,
  "OK,2.500,2.500,10.000,1"
);
caso(
  "A2 si la pantalla está vieja, se rechaza",
  `${LOTE_USADO}
   select ${AJUSTA(5, 2)};`,
  "lote_cambio_mientras_tanto"
);
caso(
  "A3 más de lo que hay no es un ajuste; igual a lo que hay, tampoco",
  `${LOTE_USADO}
   select ${AJUSTA(6, 7)} as a \\gset
   select ${AJUSTA(6, 6)} as b \\gset
   select concat_ws(',', :'a', :'b', ${SALDO_LOTE});`,
  "ajuste_invalido,ajuste_sin_cambio,6.000"
);
caso(
  "A4 un lote sin usar se corrige con el lápiz, no se ajusta",
  `${LOTE_SIN_PROVEEDOR}
   select ${AJUSTA(10, 8)};`,
  "lote_sin_usar"
);
caso(
  "A5 sin motivo se rechaza",
  `${LOTE_USADO}
   select (${AJUSTA(6, 2, "")} <> 'OK'), ${SALDO_LOTE};`,
  "t|6.000"
);
caso(
  "A6 en cero también se puede",
  `${LOTE_USADO}
   select ${AJUSTA(6, 0)} as r \\gset
   select concat_ws(',', :'r', ${SALDO_LOTE});`,
  "OK,0.000"
);
caso(
  "Q1 quien no es líder no puede ninguna",
  `${LOTE_USADO}
   ${COMPRA_SP}
   ${como(MICAELA)}
   select concat_ws(',', (${AJUSTA(6, 2)} <> 'OK'), (${REEMPLAZA("boleta", "B1", "1")} <> 'OK'), (${INT(`'select retail.asignar_proveedor_a_lote(%L, %L)', :'lote', :'prov'`)} <> 'OK'));`,
  "t,t,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
