#!/usr/bin/env node
/**
 * Prueba de la tarea 21 de «Las 36 de Finanzas» — deshacer un pago, una nota, un reembolso o el papel de un gasto (`20261109141000_anular_pago_nota_y_papel.sql`).
 *
 * QUÉ CUBRE
 *   · PAGO: anularlo deja la factura, Por pagar y el diario como antes del pago; la fila completa queda en el archivo con su motivo. Dos toques no fallan. Sin motivo, con el mes cerrado,
 *     sin el módulo o con saldo a favor encima, no.
 *   · NOTA: la factura vuelve a deber lo que la nota bajaba; a mano sigue sin borrarse.
 *   · REEMBOLSO: el saldo a favor vuelve a como estaba; un movimiento que no es reembolso no se anula.
 *   · PAPEL DE UN GASTO: con su mes abierto, el gasto vuelve a «sin comprobante» con su pago de antes; con el papel de un mes cerrado (tarea 20), el papel se anula y su crédito sale.
 *   · PEGAR DOS VECES no cambia ninguna función.
 *
 * CÓMO. Cada escena corre en UNA transacción con ROLLBACK.
 *
 * USO
 *   pnpm pruebas:anular-pago-nota-papel
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo, sin Por pagar
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (m) => readFileSync(join(RAIZ, "supabase", "migrations", m), "utf8");
const MIGRACION = leer("20261109141000_anular_pago_nota_y_papel.sql");
const ANTES = ["20261106164000_igv_congelado_al_cerrar.sql", "20261106165000_factura_con_el_mes_cerrado.sql", "20261106170000_papel_de_un_gasto_con_el_mes_cerrado.sql"].map(leer).join("\n");

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
${ANTES}
${MIGRACION}
insert into retail.proveedores (nombre) values ('ZZ Anular') returning id as prov \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco ZZ anular', 'banco', '104') returning id as banco \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select retail.fn_hoy_lima() as hoy \\gset
-- Una factura de mercadería a crédito, de hoy, con un pago de S/ 50.
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (:'prov', 'factura', 'FA01', '1', :'hoy', 'credito', :'hoy'::date + 30, 100, 18, 118, 'mercaderia', :'tru') returning id as c \\gset
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, cuenta_dinero_id) values (:'c', :'hoy', 50, 'transferencia', :'banco') returning id as pago \\gset
`;

verificar("pago", correr(`
begin;
${AYUDANTES}
select 'sin motivo no se anula|' || (pg_temp.intento(format('select retail.anular_pago_compra(%L, %L)', :'pago', ' ')) like 'Escribe por qué%');
set local request.jwt.claim.sub = '${MICAELA}';
select 'sin el módulo Por pagar no se anula|' || (pg_temp.intento(format('select retail.anular_pago_compra(%L, %L)', :'pago', 'error de monto')) like '%Por pagar%');
set local request.jwt.claim.sub = '${FELIPE}';
select retail.anular_pago_compra(:'pago', 'el monto era otro') as r \\gset
select 'el pago sale de su tabla|' || (select count(*) = 0 from retail.compra_pagos where id = :'pago');
select 'y queda en el archivo, entero y con su motivo|' || (select (fila ->> 'monto')::numeric = 50 and motivo = 'el monto era otro' and anulado_por is not null from retail.documentos_anulados where documento_id = :'pago');
select 'la factura vuelve a deber todo|' || (select pagado = 0 from retail.compras where id = :'c');
select 'Por pagar la vuelve a ver entera|' || (select saldo = 118 from retail.fn_bal_facturas(:'hoy'::date) where compra_id = :'c');
select 'el diario ya no tiene ese pago|' || (select count(*) = 0 from retail.fn_asientos(:'hoy'::date, :'hoy'::date, null) a where a.origen_id = :'pago');
select 'dos toques no fallan|' || ((retail.anular_pago_compra(:'pago', 'el monto era otro') ->> 'ya_estaba')::boolean);
select 'lo anulado se ve en la factura|' || (select count(*) = 1 and bool_and(motivo = 'el monto era otro') from retail.fn_anulados_de_compra(:'c'));
`));

verificar("pago con el mes cerrado o con saldo a favor", correr(`
begin;
${AYUDANTES}
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
values (:'prov', 'factura', 'FA02', '1', '2025-03-10', 'credito', '2025-04-10', 100, 18, 118, 'mercaderia', :'tru') returning id as cm \\gset
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, cuenta_dinero_id) values (:'cm', '2025-03-15', 50, 'transferencia', :'banco') returning id as pm \\gset
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' \\g /dev/null
select 'con el mes del pago cerrado no se anula|' || (pg_temp.intento(format('select retail.anular_pago_compra(%L, %L)', :'pm', 'error')) like '%está cerrado%');
select 'y no deja nada en el archivo|' || (select count(*) = 0 from retail.documentos_anulados where documento_id = :'pm');
insert into retail.proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, compra_pago_id) values (:'prov', 'aplicacion', 10, :'hoy', :'c', :'pago');
select 'un pago con saldo a favor encima no se anula desde aquí|' || (pg_temp.intento(format('select retail.anular_pago_compra(%L, %L)', :'pago', 'error')) like '%saldo a favor%');
`));

verificar("nota y reembolso", correr(`
begin;
${AYUDANTES}
insert into retail.compra_notas_credito (compra_id, serie_numero, fecha, subtotal, igv, monto, aplicado, motivo) values (:'c', 'FC01-9', :'hoy', 10, 1.8, 11.8, 11.8, 'descuento') returning id as nota \\gset
select 'a mano la nota sigue sin borrarse|' || (pg_temp.intento(format('delete from retail.compra_notas_credito where id = %L', :'nota')) like '%no se editan ni se borran%');
select retail.anular_nota_credito_compra(:'nota', 'se digitó mal') \\g /dev/null
select 'la nota sale y queda en el archivo|' || ((select count(*) = 0 from retail.compra_notas_credito where id = :'nota') and (select count(*) = 1 from retail.documentos_anulados where documento_id = :'nota'));
select 'la factura vuelve a deber lo que la nota bajaba|' || (select notas_credito = 0 from retail.compras where id = :'c');
insert into retail.proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, metodo, cuenta_dinero_id) values (:'prov', 'reembolso', 20, :'hoy', :'c', 'transferencia', :'banco') returning id as reem \\gset
select retail.anular_reembolso_proveedor(:'reem', 'no llegó') \\g /dev/null
select 'el reembolso sale y queda en el archivo|' || ((select count(*) = 0 from retail.proveedor_creditos where id = :'reem') and (select count(*) = 1 from retail.documentos_anulados where documento_id = :'reem'));
insert into retail.proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, compra_pago_id) values (:'prov', 'aplicacion', 5, :'hoy', :'c', :'pago') returning id as apl \\gset
select 'lo que no es reembolso no se anula|' || (pg_temp.intento(format('select retail.anular_reembolso_proveedor(%L, %L)', :'apl', 'error')) like 'Solo se anula un reembolso%');
`));

verificar("papel de un gasto", correr(`
begin;
${AYUDANTES}
select retail.registrar_gasto(:'tru', 'suministros', 'Útiles ZZ', :'hoy', 118, null, 'transferencia', null, null, null, null, null, :'banco') as g \\gset
create temp table zz_antes as select medio_pago, cuenta_dinero_id from retail.gastos where id = :'g';
select retail.agregar_comprobante_a_gasto(:'g', jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov'::uuid, 'serie', 'FG01', 'numero', '1', 'igv', 18)) \\g /dev/null
select compra_id as cg from retail.gastos where id = :'g' \\gset
select retail.quitar_comprobante_de_gasto(:'g', 'el RUC era de otro') \\g /dev/null
select 'el gasto vuelve a «sin comprobante»|' || (select compra_id is null and igv = 0 from retail.gastos where id = :'g');
select 'con el pago de antes|' || (select g.medio_pago = a.medio_pago and g.cuenta_dinero_id = a.cuenta_dinero_id from retail.gastos g, zz_antes a where g.id = :'g');
select 'el comprobante queda anulado, con su motivo|' || (select estado = 'anulada' and motivo_anulacion = 'el RUC era de otro' from retail.compras where id = :'cg');
select 'y su pago, en el archivo|' || ((select count(*) = 0 from retail.compra_pagos where compra_id = :'cg') and (select count(*) = 1 from retail.documentos_anulados where compra_id = :'cg'));
select 'su IGV ya no se descuenta|' || (select count(*) = 0 from retail.fn_impuestos_compras(:'hoy'::date, :'hoy'::date) x where x.id = :'cg');
select 'dos toques no fallan|' || ((retail.quitar_comprobante_de_gasto(:'g', 'el RUC era de otro') ->> 'ya_estaba')::boolean);
select 'se le puede volver a agregar el papel correcto|' || (pg_temp.intento(format($s$select retail.agregar_comprobante_a_gasto(%L, jsonb_build_object('tipo', 'factura', 'proveedor_id', %L::uuid, 'serie', 'FG01', 'numero', '2', 'igv', 18))$s$, :'g', :'prov')) = 'SIN_ERROR');
-- El papel de un gasto de un mes cerrado.
select retail.registrar_gasto(:'tru', 'suministros', 'Marzo ZZ', '2025-03-20', 118, null, 'transferencia', null, null, null, null, null, :'banco') as gm \\gset
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' \\g /dev/null
select retail.agregar_comprobante_a_gasto(:'gm', jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov'::uuid, 'serie', 'FG02', 'numero', '1', 'igv', 18)) \\g /dev/null
select retail.quitar_comprobante_de_gasto(:'gm', 'no era de este gasto') \\g /dev/null
select 'el papel tardío queda anulado, no se borra|' || (select anulado_en is not null and motivo_anulacion = 'no era de este gasto' from retail.gasto_papeles_tardios where gasto_id = :'gm');
select 'y su crédito sale del mes|' || (select count(*) = 0 from retail.fn_impuestos_compras(date_trunc('month', :'hoy'::date)::date, :'hoy'::date) x join retail.gasto_papeles_tardios t on t.id = x.id where t.gasto_id = :'gm');
`));

verificar("pegar dos veces", correr(`
begin;
${AYUDANTES}
create temp table zz_defs as select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_libro_compras_es_inmutable', 'fn_libro_creditos_es_inmutable', 'fn_gastos_solo_anular', 'fn_gastos_sellar', 'anular_pago_compra', 'quitar_comprobante_de_gasto');
${MIGRACION}
select 'pegarla otra vez no cambia ninguna función|' || (select bool_and(md5(pg_get_functiondef(z.f::regprocedure)) = z.h) from zz_defs z);
select 'quien no entra no anula nada|' || (select not has_function_privilege('anon', 'retail.anular_pago_compra(uuid, text)', 'execute'));
`));

console.log(`\n${casos - fallos}/${casos} verificaciones pasaron.`);
if (fallos) process.exit(1);
