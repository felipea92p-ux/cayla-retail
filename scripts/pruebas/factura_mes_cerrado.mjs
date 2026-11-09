#!/usr/bin/env node
/**
 * Prueba de la tarea 20 de «Las 36 de Finanzas» — la factura que llega con el mes cerrado (`20261109144000_factura_con_el_mes_cerrado.sql` y
 * `20261109145000_papel_de_un_gasto_con_el_mes_cerrado.sql`).
 *
 * QUÉ CUBRE
 *   · GASTO CON FACTURA: en un mes cerrado entra con su fecha real y cuenta hoy: gasto, pago, crédito y registro. El mes cerrado no cambia: ni su huella, ni su IGV, ni su registro.
 *   · MERCADERÍA: el asiento y lo que se debe van en el mes abierto.
 *   · TALLER: igual.
 *   · LO DEMÁS SIGUE IGUAL: en un mes abierto no se llena nada; un gasto sin comprobante en un mes cerrado se rechaza; un comprobante no elige su mes a mano.
 *   · CORREGIR: una factura a crédito se puede anular porque su mes contable está abierto.
 *   · EL PAPEL DE UN GASTO DE UN MES CERRADO: el gasto no cambia, el crédito y el asiento entran hoy, y deja de pedir su comprobante.
 *   · PEGAR DOS VECES no cambia ninguna función.
 *
 * CÓMO. Cada escena corre en UNA transacción con ROLLBACK, con marzo de 2025 como mes cerrado.
 *
 * USO
 *   pnpm pruebas:factura-mes-cerrado
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (m) => readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8");
const MIGRACION = leer("20261109144000_factura_con_el_mes_cerrado.sql");
const ANTERIOR = leer("20261109143000_igv_congelado_al_cerrar.sql");
const PAPEL_TARDIO = leer("20261109145000_papel_de_un_gasto_con_el_mes_cerrado.sql");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
function verificar(titulo, r) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  for (const linea of r.salida.split("\n").filter((l) => l.includes("|"))) {
    const i = linea.lastIndexOf("|");
    esperar(`${titulo}: ${linea.slice(0, i)}`, linea.slice(i + 1) === "true", linea);
  }
}

const AYUDANTES = `
set local request.jwt.claim.sub = '${FELIPE}';
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
update retail.parametros_finanzas set inicio_finanzas = '2025-03-01' where id;
${ANTERIOR}
${MIGRACION}
${PAPEL_TARDIO}
insert into retail.proveedores (nombre) values ('ZZ Factura tardía') returning id as prov \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('ZZ Taller tardío', 'maquila') returning id as pt \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco ZZ', 'banco', '104') returning id as banco \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by created_at, id limit 1 \\gset
select retail.fn_hoy_lima() as hoy \\gset
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') \\g /dev/null
`;
const PAPEL = (numero) => `jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov'::uuid, 'serie', 'FT01', 'numero', '${numero}', 'condicion', 'contado')`;
const GASTO = (fecha, numero) => `retail.registrar_gasto(:'tru', 'suministros', 'Gasto tardío', '${fecha}', 118, ${PAPEL(numero)}, 'transferencia', null, null, null, null, null, :'banco')`;

verificar("gasto con factura", correr(`
begin;
${AYUDANTES}
create temp table zz_antes as select (select debito::text || '/' || credito::text from retail.fn_impuestos_igv_meses('2025-03-01', '2025-03-01')) as igv,
  (select count(*) from retail.fn_impuestos_registro_compras('2025-03-01')) as registro;
select ${GASTO("2025-03-20", "1")} as g \\gset
select 'guarda la fecha real del papel|' || (select fecha_emision = '2025-03-20' from retail.compras where serie = 'FT01' and numero = '1');
select 'y cuenta hoy|' || (select fecha_contable = :'hoy'::date from retail.compras where serie = 'FT01' and numero = '1');
select 'el gasto entra hoy|' || (select g.fecha = :'hoy'::date from retail.gastos g join retail.compras c on c.id = g.compra_id where c.serie = 'FT01' and c.numero = '1');
select 'el pago también|' || (select p.fecha = :'hoy'::date from retail.compra_pagos p join retail.compras c on c.id = p.compra_id where c.serie = 'FT01' and c.numero = '1');
select 'el IGV de marzo no cambia|' || (select (select debito::text || '/' || credito::text from retail.fn_impuestos_igv_meses('2025-03-01', '2025-03-01')) = igv from zz_antes);
select 'su registro tampoco|' || (select (select count(*) from retail.fn_impuestos_registro_compras('2025-03-01')) = registro from zz_antes);
select 'la huella del mes cerrado sigue igual|' || (select bool_and((x ->> 'ok')::boolean) from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x where x ->> 'clave' = 'huella');
select 'no sale el aviso de IGV cambiado|' || (select count(*) = 0 from retail.fn_igv_cambios_desde_cierre());
select 'el crédito entra en el mes de hoy|' || (select count(*) = 1 from retail.fn_impuestos_compras(date_trunc('month', :'hoy'::date)::date, :'hoy'::date) x join retail.compras c on c.id = x.id where c.serie = 'FT01' and c.numero = '1' and x.da_credito);
select 'el registro de hoy la lista con su fecha real|' || (select count(*) = 1 from retail.fn_impuestos_registro_compras(:'hoy'::date) r where r.serie = 'FT01' and r.numero = '1' and r.fecha = '2025-03-20');
`));

verificar("mercadería y taller", correr(`
begin;
${AYUDANTES}
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (:'prov', 'factura', 'FT02', '1', '2025-03-15', 'credito', '2025-04-15', 100, 18, 118, 'mercaderia', :'tru') returning id as c \\gset
select 'la mercadería entra con su fecha real|' || (select fecha_contable = :'hoy'::date and fecha_emision = '2025-03-15' from retail.compras where id = :'c');
select 'su asiento va hoy, no en marzo|' || (select count(*) filter (where a.fecha = :'hoy'::date) = 3 and count(*) filter (where a.fecha < :'hoy'::date) = 0 from retail.fn_asientos('2025-03-01', :'hoy'::date, :'tru') a where a.origen_tabla = 'compras' and a.origen_id = :'c');
select 'al cierre de marzo no se debe|' || (select count(*) = 0 from retail.fn_bal_facturas('2025-03-31') f where f.compra_id = :'c');
select 'hoy sí se debe|' || (select count(*) = 1 from retail.fn_bal_facturas(:'hoy'::date) f where f.compra_id = :'c');
select 'se puede anular: su mes contable está abierto|' || (pg_temp.intento(format($s$update retail.compras set estado = 'anulada', motivo_anulacion = 'prueba' where id = %L$s$, :'c')) = 'SIN_ERROR');
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total)
values (:'pt', 'factura', 'FT03', '1', '2025-03-05', 'contado', 50, 9, 59) returning id as cp \\gset
select 'el comprobante del Taller también|' || (select fecha_contable = :'hoy'::date from retail.comprobantes_produccion where id = :'cp');
select 'y su crédito entra hoy|' || (select count(*) = 1 from retail.fn_impuestos_compras(date_trunc('month', :'hoy'::date)::date, :'hoy'::date) x where x.id = :'cp');
`));

verificar("lo demás sigue igual", correr(`
begin;
${AYUDANTES}
select ${GASTO("2025-04-20", "2")} as g2 \\gset
select 'en un mes abierto no se llena|' || (select c.fecha_contable is null from retail.compras c join retail.gastos g on g.compra_id = c.id where g.id = :'g2');
select 'un gasto sin comprobante en un mes cerrado se rechaza|' || (pg_temp.intento(format($s$select retail.registrar_gasto(%L, 'suministros', 'Sin papel', '2025-03-20', 50, null, 'transferencia', null, null, null, null, null, %L)$s$, :'tru', :'banco')) like '%está cerrado%');
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id, fecha_contable)
values (:'prov', 'factura', 'FT04', '1', '2025-04-15', 'credito', '2025-05-15', 100, 18, 118, 'mercaderia', :'tru', '2025-03-15') returning id as c \\gset
select 'un comprobante no elige su mes a mano|' || (select fecha_contable is null from retail.compras where id = :'c');
select 'cambiar la fecha a un mes cerrado la lleva al mes abierto|' || (pg_temp.intento(format($s$update retail.compras set fecha_emision = '2025-03-16' where id = %L$s$, :'c')) = 'SIN_ERROR');
select 'y cuenta hoy|' || (select fecha_contable = :'hoy'::date from retail.compras where id = :'c');
`));

verificar("papel de un gasto cerrado", correr(`
begin;
${AYUDANTES}
-- El gasto se registra sin papel en marzo, y marzo de esa tienda se cierra después.
select retail.reabrir_periodo('2025-03-01', 'ubicacion', :'tru', 'para registrar el gasto') \\g /dev/null
select retail.registrar_gasto(:'tru', 'suministros', 'Gasto sin papel', '2025-03-20', 118, null, 'transferencia', null, null, null, null, null, :'banco') as g \\gset
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') \\g /dev/null
create temp table zz_gasto as select to_jsonb(g.*) as fila from retail.gastos g where g.id = :'g';
create temp table zz_marzo as select count(*) as n, sum(debe) as d from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru');
select retail.agregar_comprobante_a_gasto(:'g', jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov'::uuid, 'serie', 'FT05', 'numero', '1', 'fecha_emision', '2025-03-25', 'igv', 18)) as r \\gset
select 'dice en qué fecha entra|' || ((:'r'::jsonb ->> 'entra_en')::date = :'hoy'::date);
select 'el gasto no cambia|' || (select to_jsonb(g.*) = z.fila from retail.gastos g, zz_gasto z where g.id = :'g');
select 'no se crea una compra ni un pago|' || (select count(*) = 0 from retail.compras where serie = 'FT05');
select 'marzo no cambia|' || (select (select count(*) from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru')) = n from zz_marzo);
select 'la huella de marzo sigue igual|' || (select bool_and((x ->> 'ok')::boolean) from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x where x ->> 'clave' = 'huella');
select 'el asiento entra hoy y cuadra|' || (select count(*) = 2 and sum(a.debe) = 18 and sum(a.haber) = 18 and min(a.fecha) = :'hoy'::date from retail.fn_asientos('2025-03-01', :'hoy'::date, :'tru') a where a.regla = 'gasto_papel');
select 'descuenta el crédito hoy|' || (select count(*) = 1 and sum(x.igv) = 18 from retail.fn_impuestos_compras(date_trunc('month', :'hoy'::date)::date, :'hoy'::date) x join retail.gasto_papeles_tardios t on t.id = x.id where x.da_credito);
select 'y el IGV del mes lo suma|' || (select credito_gastos >= 18 from retail.fn_impuestos_igv_meses(date_trunc('month', :'hoy'::date)::date, :'hoy'::date));
select 'el registro la lista hoy con su fecha real|' || (select count(*) = 1 from retail.fn_impuestos_registro_compras(:'hoy'::date) r where r.serie = 'FT05' and r.fecha = '2025-03-25');
select 'el gasto ya dice su papel|' || (select tipo = 'factura' and documento = 'FT05-1' from retail.fn_gastos_papeles_tardios('2025-03-01', '2025-03-31', :'tru') where gasto_id = :'g');
select 'dos toques devuelven lo mismo|' || ((retail.agregar_comprobante_a_gasto(:'g', jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov'::uuid, 'serie', 'FT05', 'numero', '1', 'fecha_emision', '2025-03-25', 'igv', 18)) ->> 'ya_estaba')::boolean);
select 'otro papel para el mismo gasto, no|' || (pg_temp.intento(format($s$select retail.agregar_comprobante_a_gasto(%L, jsonb_build_object('tipo', 'factura', 'proveedor_id', %L::uuid, 'serie', 'FT05', 'numero', '2', 'igv', 18))$s$, :'g', :'prov')) like '%ya tiene su comprobante%');
select 'el mismo papel no entra como compra|' || (pg_temp.intento(format($s$insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, naturaleza) values (%L, 'factura', 'FT05', '1', '2025-04-01', 'contado', 100, 18, 118, 'gasto')$s$, :'prov')) like '%ya está registrado%');
select 'el Balance sigue cuadrando el IGV: el diario y lo declarado dicen lo mismo|' || (select coalesce(sum(a.debe) - sum(a.haber), 0) = 18 from retail.fn_asientos(date_trunc('month', :'hoy'::date)::date, :'hoy'::date, :'tru') a where a.regla = 'gasto_papel' and a.cuenta = '4011');
`));

verificar("pegar dos veces", correr(`
begin;
${AYUDANTES}
create temp table zz_defs as select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_candado_compras', 'fn_candado_comprobantes_produccion', 'registrar_gasto', 'fn_comprobante_y_pago', 'fn_asientos', 'fn_bal_facturas', 'fn_bal_por_recibir', 'fn_bal_causas_mercaderia', 'fn_cierre_mes_estado', 'fn_impuestos_compras', 'fn_igv_credito_fiscal', 'fn_impuestos_panel', 'fn_impuestos_registro_compras', 'fn_sustento_costos', 'agregar_comprobante_a_gasto', 'fn_compras_fecha_contable', 'fn_gastos_papeles_tardios');
${MIGRACION}
${PAPEL_TARDIO}
select 'pegarla otra vez no cambia ninguna función|' || (select bool_and(md5(pg_get_functiondef(z.f::regprocedure)) = z.h) from zz_defs z);
`));

console.log(`\n${casos - fallos}/${casos} verificaciones pasaron.`);
if (fallos) process.exit(1);
