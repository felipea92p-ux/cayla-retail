#!/usr/bin/env node
/**
 * Pruebas de «pagar a un servicio, con el papel que dio» (ADR-0614, actividad 4) — migración `20261105222000_pagar_servicio_de_la_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que cada papel deje el comprobante correcto y baje la deuda por el monto sin IGV; que al contado exija su pago y a crédito su vencimiento; que no se
 * pague de más ni a un servicio sin nombre; que un reintento no duplique; que solo un líder pague; y que Impuestos cuente el recibo y deje fuera lo que no tiene papel.
 *
 * USO
 *   node scripts/pruebas/produccion_pagar_servicio.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_pagar_servicio.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_pagar_servicio.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105222000_pagar_servicio_de_la_orden.sql"), "utf8"));

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
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
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
insert into retail.proveedores_produccion (nombre, rubro) values ('Costura Prueba Por Pagar', 'maquila') returning id as maquila \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(*) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 1
  order by p.created_at limit 1 \\gset
select v.id as v1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.id limit 1 \\gset
update retail.variantes set costo = 8.00 where id = :'v1';
${como(FELIPE)}
`;

const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'5.00'` });
const COSTURA_SIN_NOMBRE = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_pendiente: "true", tarifa_prenda: `'5.00'` });
const APERTURA = `jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '20')))`;
const L = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${n}'))`;
const VUELTA = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'buenas', '${n}'))`;

/** Una orden con Corte hecho y la costura afuera: deja :oid y :f_cost. */
const ABRIR = (costura = COSTURA) => `select pg_temp.abre(${APERTURA}, jsonb_build_array(${TALLER("corte")}, ${costura}, ${TALLER("acabado")})) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
   select retail.registrar_avance(:'f_corte', ${L(20)}, null) as _a \\gset`;
const SALE_Y_VUELVE = (n) => `select retail.registrar_salida(:'f_cost', ${L(n)}, null, null) as _s \\gset
   select retail.registrar_vuelta(:'f_cost', ${VUELTA(n)}, null, null) as _v \\gset`;
const CERRAR = `select retail.registrar_avance(:'f_acab', ${L(20)}, null) as _ac \\gset
   select retail.cerrar_produccion_con_motivo(:'oid', ${L(20)}, 0, 0, null, true, 'motivo de prueba') as _c \\gset`;
const FILA = `(select concat_ws('/', s.devengado, s.documentado, s.falta) from retail.fn_servicios_por_pagar() s where s.fase_id = :'f_cost')`;
/** Una factura, con su línea apuntando a la fase. */
const FACTURA = (subtotal, igv) => `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '77', 'credito', retail.fn_hoy_lima() + 7, ${subtotal}, ${igv}, ${subtotal + igv}) returning id as comp \\gset
   insert into retail.comprobantes_produccion_items (comprobante_id, descripcion, cantidad, costo_unitario, fase_id) values (:'comp', 'Costura', 1, ${subtotal}, :'f_cost');`;

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

const PAGA = (monto, tipo, extra = "") => `pg_temp.intento(format('select retail.pagar_servicio_de_orden(%L, ${monto}, %L ${extra})', :'f_cost', '${tipo}'))`;
const CONTADO_FN = (m) => `, p_condicion => ''contado'', p_pago => jsonb_build_array(jsonb_build_object(''metodo'', ''transferencia'', ''monto'', ''${m}''))`;
const SERIE_FN = (s, n) => `, p_serie => ''${s}'', p_numero => ''${n}''`;
const CREDITO_FN = `, p_condicion => ''credito'', p_fecha_vencimiento => retail.fn_hoy_lima() + 7`;
const ULTIMO = `(select concat_ws('/', c.tipo, c.condicion, c.subtotal, c.igv, c.total) from retail.comprobantes_produccion c join retail.comprobantes_produccion_items i on i.comprobante_id = c.id where i.fase_id = :'f_cost' order by c.created_at desc limit 1)`;
const PAGADO = `(select coalesce(sum(g.monto), 0) from retail.comprobantes_produccion_pagos g join retail.comprobantes_produccion_items i on i.comprobante_id = g.comprobante_id where i.fase_id = :'f_cost')`;
const LISTO = `${ABRIR()}
   ${SALE_Y_VUELVE(20)}`;

caso(
  "M1 la migración se vuelve a cargar sin error, y una compra de insumos por la misma puerta sigue sin fase",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_function_privilege('authenticated', 'retail.pagar_servicio_de_orden(uuid,numeric,text,text,text,date,text,date,numeric,jsonb,text,uuid)', 'execute'),
     has_function_privilege('anon', 'retail.pagar_servicio_de_orden(uuid,numeric,text,text,text,date,text,date,numeric,jsonb,text,uuid)', 'execute'));`,
  "t,f"
);
caso(
  "F1 factura al contado: el pago lleva el IGV, y la deuda se salda por el monto sin IGV",
  `${LISTO}
   select ${PAGA(100, "factura", SERIE_FN("F001", "9") + CONTADO_FN("118.00"))} as r \\gset
   select concat_ws(',', :'r', ${ULTIMO}, ${PAGADO}, coalesce(${FILA}, 'saldada'));`,
  "OK,factura/contado/100.00/18.00/118.00,118.00,saldada"
);
caso(
  "R1 recibo por honorarios: sin IGV, y entra a Impuestos",
  `${LISTO}
   select ${PAGA(100, "recibo_por_honorarios", SERIE_FN("E001", "12") + CONTADO_FN("100.00"))} as r \\gset
   select concat_ws(',', :'r', ${ULTIMO},
     (select count(*) from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.tipo = 'recibo_por_honorarios' and x.total = 100));`,
  "OK,recibo_por_honorarios/contado/100.00/0.00/100.00,1"
);
caso(
  "S1 sin papel: la base pone serie y número, no da IGV y queda fuera de Impuestos",
  `${LISTO}
   select ${PAGA(100, "sin_comprobante", CONTADO_FN("100.00"))} as r \\gset
   select concat_ws(',', :'r', ${ULTIMO},
     (select c.serie = 'S/P' and c.numero like 'OP-%-costura-1' from retail.comprobantes_produccion c join retail.comprobantes_produccion_items i on i.comprobante_id = c.id where i.fase_id = :'f_cost'),
     (select count(*) from retail.fn_impuestos_compras(retail.fn_hoy_lima(), retail.fn_hoy_lima()) x where x.tipo = 'sin_comprobante'));`,
  "OK,sin_comprobante/contado/100.00/0.00/100.00,t,0"
);
caso(
  "S2 dos pagos sin papel del mismo paso no chocan por el número",
  `${LISTO}
   select ${PAGA(40, "sin_comprobante", CONTADO_FN("40.00"))} as r1 \\gset
   select ${PAGA(60, "sin_comprobante", CONTADO_FN("60.00"))} as r2 \\gset
   select concat_ws(',', :'r1', :'r2', coalesce(${FILA}, 'saldada'));`,
  "OK,OK,saldada"
);
caso(
  "C1 a crédito: queda como deuda con vencimiento en Por pagar y sale de los servicios sin papel, sin pago todavía",
  `${LISTO}
   select ${PAGA(100, "boleta", SERIE_FN("B001", "7") + CREDITO_FN)} as r \\gset
   select concat_ws(',', :'r', ${ULTIMO}, ${PAGADO}, coalesce(${FILA}, 'saldada'),
     (select d.saldo from retail.fn_deuda_consolidada() d where d.origen = 'produccion' and d.proveedor_id = :'maquila'));`,
  "OK,boleta/credito/100.00/0.00/100.00,0,saldada,100.00"
);
caso(
  "P1 un pago parcial deja el resto",
  `${LISTO}
   select ${PAGA(30, "sin_comprobante", CONTADO_FN("30.00"))} as r \\gset
   select concat_ws(',', :'r', ${FILA});`,
  "OK,100.00/30.00/70.00"
);
caso(
  "E1 no se paga más de lo que se debe, y no queda nada escrito",
  `${LISTO}
   select ${PAGA(100.01, "sin_comprobante", CONTADO_FN("100.01"))} as r \\gset
   select concat_ws(',', :'r', ${FILA});`,
  "servicio_monto_de_mas,100.00/0/100.00"
);
caso(
  "E2 un monto en cero o con más de dos decimales se rechaza",
  `${LISTO}
   select ${PAGA(0, "sin_comprobante", CONTADO_FN("0"))} as r0 \\gset
   select ${PAGA(1.234, "sin_comprobante", CONTADO_FN("1.23"))} as r1 \\gset
   select concat_ws(',', :'r0', :'r1');`,
  "servicio_monto_invalido,servicio_monto_invalido"
);
caso(
  "E3 a un servicio sin nombre no se le paga: primero se registra quién fue",
  `${ABRIR(COSTURA_SIN_NOMBRE)}
   ${SALE_Y_VUELVE(20)}
   select ${PAGA(100, "sin_comprobante", CONTADO_FN("100.00"))};`,
  "servicio_sin_nombre"
);
caso(
  "E4 al contado sin su pago se rechaza, igual que una factura cualquiera",
  `${LISTO}
   select (${PAGA(100, "boleta", SERIE_FN("B001", "8"))} like '%se registra con su pago%');`,
  "t"
);
caso(
  "E5 una factura necesita serie y número; sin papel, no",
  `${LISTO}
   select (${PAGA(100, "factura", CONTADO_FN("118.00"))} like '%serie y número%');`,
  "t"
);
caso(
  "T1 el mismo token no paga dos veces, aunque la deuda ya esté saldada",
  `${LISTO}
   select gen_random_uuid() as tk \\gset
   select pg_temp.intento(format('select retail.pagar_servicio_de_orden(%L, 100, %L, p_condicion => %L, p_pago => jsonb_build_array(jsonb_build_object(%L, %L, %L, %L)), p_token => %L)', :'f_cost', 'sin_comprobante', 'contado', 'metodo', 'transferencia', 'monto', '100.00', :'tk')) as a \\gset
   select pg_temp.intento(format('select retail.pagar_servicio_de_orden(%L, 100, %L, p_condicion => %L, p_pago => jsonb_build_array(jsonb_build_object(%L, %L, %L, %L)), p_token => %L)', :'f_cost', 'sin_comprobante', 'contado', 'metodo', 'transferencia', 'monto', '100.00', :'tk')) as b \\gset
   select concat_ws(',', :'a', :'b', ${PAGADO}, (select count(*) from retail.comprobantes_produccion where token_cliente = :'tk'));`,
  "OK,OK,100.00,1"
);
caso(
  "Q1 quien no es líder no paga",
  `${LISTO}
   ${como(MICAELA)}
   select coalesce(${PAGA(100, "sin_comprobante", CONTADO_FN("100.00"))} like '%', false), (select count(*) from retail.comprobantes_produccion_items where fase_id = :'f_cost');`,
  "t|0"
);
caso(
  "A1 anular una factura a crédito devuelve la deuda del servicio",
  `${LISTO}
   select ${PAGA(100, "boleta", SERIE_FN("B001", "9") + CREDITO_FN)} as r \\gset
   select c.id as comp from retail.comprobantes_produccion c join retail.comprobantes_produccion_items i on i.comprobante_id = c.id where i.fase_id = :'f_cost' \\gset
   select pg_temp.intento(format('select retail.anular_comprobante_produccion(%L, %L)', :'comp', 'prueba')) as a \\gset
   select concat_ws(',', :'r', :'a', ${FILA});`,
  "OK,OK,100.00/0/100.00"
);
caso(
  "O1 una línea de insumo por la puerta de siempre sigue funcionando sin fase",
  `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total) values (:'maquila', 'factura', 'F9', '1', 'credito', retail.fn_hoy_lima() + 3, 0, 0, 0) returning id as x \\gset
   select pg_temp.intento(format('select retail.registrar_comprobante_produccion(%L, %L, %L, %L, %L::jsonb, p_tipo => %L, p_fecha_vencimiento => retail.fn_hoy_lima() + 7)', :'maquila', 'F9', '2', 'credito', jsonb_build_array(jsonb_build_object('descripcion', 'Flete', 'cantidad', '1', 'costo_unitario', '50')), 'boleta')) as r \\gset
   select concat_ws(',', :'r', (select i.fase_id is null from retail.comprobantes_produccion_items i where i.descripcion = 'Flete'));`,
  "OK,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
