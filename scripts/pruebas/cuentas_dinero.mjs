#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F3 — Cuentas y dinero (`20260925110000_finanzas_cuentas_y_dinero.sql`).
 *
 * QUÉ CUBRE
 *   · las cuentas nacen solas (cajón y caja fuerte por sede, una de efectivo por rendir) y no se borran;
 *   · cada tipo de movimiento: depósito del cajón (creando el egreso o tomando uno ya registrado), abono de tarjeta con
 *     su comisión como gasto 639, pago de la tarjeta, entre cuentas, caja fuerte → banco, aporte, préstamo, retiro y
 *     devolución (que no puede pasar lo que CAYLA debe);
 *   · se anula con motivo y no se borra ni se edita; la comisión se anula con su abono;
 *   · los saldos se suman: cajón = lo que dice la caja, caja fuerte = traslados del cierre ± movimientos, bancos = saldo
 *     inicial + cobros según `medios_de_cobro` (con vigencia: cambiarla no mueve lo pasado) + pagos + movimientos;
 *   · un egreso de caja respalda UNA sola cosa: gasto, activo, «no es gasto» o movimiento;
 *   · decisión B: con el módulo, solo su tienda y solo depósitos; conciliar y administrar, solo el líder;
 *   · conciliación: la diferencia con el banco y las líneas revisadas; nadie lee las tablas directo.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:cuentas-dinero    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
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
`;
// El saldo de una cuenta hoy, visto por el líder.
const SALDO = `
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id;
$f$;
`;

/** Trujillo y Lima con sus cajones y cajas fuertes; cuatro cuentas nuevas desde hace 20 días (BCP con S/ 1,000,
 *  Interbank en cero, el POS con S/ 1,000 por abonar y la Visa debiendo S/ 500); la caja de Trujillo abierta con S/ 1,000
 *  y un egreso «Depósito bancario» de S/ 300 que la tienda registró. */
const ESCENA = `
begin;
${INTENTO}
${SALDO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as cajon_lim from retail.cuentas_dinero where ubicacion_id = :'lim' and tipo = 'cajon' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' \\gset
select retail.crear_cuenta_dinero('BCP prueba F3', 'banco', 1000, retail.fn_hoy_lima() - 20) as bcp \\gset
select retail.crear_cuenta_dinero('Interbank prueba F3', 'banco', 0, retail.fn_hoy_lima() - 20) as ibk \\gset
select retail.crear_cuenta_dinero('Niubiz prueba F3', 'por_abonar', 1000, retail.fn_hoy_lima() - 20) as pos \\gset
select retail.crear_cuenta_dinero('Visa prueba F3', 'tarjeta_credito', -500, retail.fn_hoy_lima() - 20) as visa \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 300, 'Depósito bancario', 'Voucher 7788', false, null::uuid) as egreso \\gset
`;
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Las cuentas nacen solas y no se borran; solo se agregan bancos, POS y tarjetas.
{
  const r = correr(`${ESCENA}
select count(*) filter (where c.tipo = 'cajon'), count(*) filter (where c.tipo = 'caja_fuerte') from retail.cuentas_dinero c join retail.ubicaciones u on u.id = c.ubicacion_id where u.activo and u.tipo in ('tienda', 'taller');
select count(*) from retail.ubicaciones where activo and tipo in ('tienda', 'taller');
select count(*) from retail.cuentas_dinero where tipo = 'por_rendir';
select string_agg(cuenta_contable, ',' order by cuenta_contable) from retail.cuentas_dinero where id in (:'bcp', :'pos', :'visa', :'cajon_tru');
select pg_temp.intento('select retail.crear_cuenta_dinero(''Otro cajón'', ''cajon'')');
select pg_temp.intento('select retail.crear_cuenta_dinero(''bcp PRUEBA f3'', ''banco'')');
select pg_temp.intento(format('delete from retail.cuentas_dinero where id = %L', :'bcp'));
select pg_temp.intento(format('select retail.archivar_cuenta_dinero(%L)', :'cajon_tru'));
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Prueba F3', 'tienda') returning id as nueva \\gset
select string_agg(tipo || ':' || nombre, ',' order by tipo) from retail.cuentas_dinero where ubicacion_id = :'nueva';`);
  const [porSede, sedes, rendir, contables, cajon, repetida, borrar, archivarCajon, nueva] = lineas(r);
  esperar("cada tienda y el Taller tienen su cajón y su caja fuerte", r.ok && porSede === `${sedes}|${sedes}`, r);
  esperar("una sola cuenta de efectivo por rendir", r.ok && rendir === "1", r);
  esperar("cada tipo con su cuenta contable: 101 cajón, 104 banco, 105 POS, 451 tarjeta", r.ok && contables === "101,104,105,451", r);
  esperar("un cajón no se agrega a mano (nace con la tienda)", r.ok && cajon.includes("nacen con cada tienda"), r);
  esperar("no hay dos cuentas activas con el mismo nombre", r.ok && repetida.includes("Ya hay una cuenta"), r);
  esperar("una cuenta no se borra", r.ok && borrar.includes("no se borra"), r);
  esperar("el cajón no se archiva", r.ok && archivarCajon.includes("no se archivan"), r);
  esperar("una tienda nueva nace con su cajón y su caja fuerte", r.ok && nueva === "caja_fuerte:Caja fuerte · Tienda Prueba F3,cajon:Cajón · Tienda Prueba F3", r);
}

// 2. Depósito del cajón al banco: crea su egreso en la misma operación o toma uno ya registrado. Los saldos se suman.
{
  const r = correr(`${ESCENA}
select pg_temp.saldo(:'cajon_tru'), pg_temp.saldo(:'bcp');
select retail.registrar_movimiento_dinero('deposito', 200, :'cajon_tru', :'bcp', null, 'Voucher 1', 0, :'caja') as m1 \\gset
select k.motivo, k.monto, left(k.nota, 20) from retail.movimientos_dinero d join retail.caja_movimientos k on k.id = d.caja_movimiento_id where d.id = :'m1';
select pg_temp.saldo(:'cajon_tru'), pg_temp.saldo(:'bcp');
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'bcp', null, null, 0, null, :'egreso') as m2 \\gset
select pg_temp.saldo(:'cajon_tru'), pg_temp.saldo(:'bcp');
select egresos, depositos, esperado from retail.fn_efectivo_por_tienda(:'tru');
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 300, %L, %L, null, null, 0, null, %L)', :'cajon_tru', :'ibk', :'egreso'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 250, %L, %L, null, null, 0, %L)', :'cajon_lim', :'bcp', :'caja'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 50, %L, %L)', :'cajon_tru', :'bcp'));`);
  const [antes, egreso, tras1, tras2, efectivo, sinClasificar, dosVeces, otraCaja, sinEgreso] = lineas(r);
  esperar("antes: el cajón dice lo que dice la caja (1,000 − 300 del egreso), el BCP su saldo inicial", r.ok && antes === "700.00|1000.00", r);
  esperar("el depósito crea su egreso de caja «Depósito bancario» del mismo monto", r.ok && egreso === "Depósito bancario|200.00|Depósito a BCP prueb", r);
  esperar("el cajón baja 200 y el BCP sube 200", r.ok && tras1 === "500.00|1200.00", r);
  esperar("tomando el egreso ya registrado: el cajón no baja otra vez, el BCP sube 300", r.ok && tras2 === "500.00|1500.00", r);
  esperar("Efectivo por tienda separa los depósitos de los egresos y da el mismo esperado que el cierre", r.ok && efectivo === "0.00|500.00|500.00", r);
  esperar("el egreso depositado ya no está por clasificar", r.ok && Number(sinClasificar) === 0, r);
  esperar("un egreso respalda un solo depósito", r.ok && dosVeces.includes("ya es un depósito"), r);
  esperar("la caja tiene que ser la de ese cajón", r.ok && otraCaja.includes("no es la de"), r);
  esperar("del cajón, sin caja ni egreso, no se puede", r.ok && sinEgreso.includes("caja abierta o de un egreso"), r);
}

// 3. Un egreso respalda UNA sola cosa: gasto, activo, «no es gasto» o movimiento.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'bcp', null, null, 0, null, :'egreso') as m \\gset
select pg_temp.intento(format('select retail.registrar_gasto(%L, ''suministros'', ''x'', retail.fn_hoy_lima(), 300, null, ''efectivo'', null, %L)', :'tru', :'egreso'));
select pg_temp.intento(format('select retail.marcar_egreso_no_gasto(%L, ''deposito'')', :'egreso'));
select pg_temp.intento(format('select retail.registrar_activo(%L, ''muebles'', ''Estante'', retail.fn_hoy_lima(), 300, null, ''efectivo'', null, %L)', :'tru', :'egreso'));
select retail.registrar_movimiento_caja(:'caja', 'egreso', 40, 'Otro', 'mototaxi', false, null::uuid) as e2 \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Mototaxi', retail.fn_hoy_lima(), 40, null, 'efectivo', null, :'e2') as g \\gset
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 40, %L, %L, null, null, 0, null, %L)', :'cajon_tru', :'bcp', :'e2'));
select retail.registrar_movimiento_caja(:'caja', 'egreso', 120, 'Depósito bancario', 'op 9', false, null::uuid) as e3 \\gset
select retail.marcar_egreso_no_gasto(:'e3', 'deposito') as marca \\gset
select retail.registrar_movimiento_dinero('deposito', 120, null, :'ibk', null, null, 0, null, :'e3') as m3 \\gset
select revertido_en is not null from retail.egresos_no_gasto where id = :'marca';
select pg_temp.saldo(:'ibk');
select retail.registrar_movimiento_caja(:'caja', 'egreso', 60, 'Otro', 'ajuste', false, null::uuid) as e4 \\gset
select retail.marcar_egreso_no_gasto(:'e4', 'ajuste') as _m \\gset
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 60, %L, %L, null, null, 0, null, %L)', :'cajon_tru', :'bcp', :'e4'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 99, %L, %L, null, null, 0, null, %L)', :'cajon_tru', :'bcp', :'e4'));`);
  const [gasto, marca, activo, depGasto, revertida, ibk, otraMarca, otroMonto] = lineas(r);
  esperar("un egreso depositado no puede ser gasto", r.ok && gasto.includes("depósito o un retiro"), r);
  esperar("ni marcarse «no es gasto»", r.ok && marca.includes("depósito o un retiro"), r);
  esperar("ni un activo", r.ok && activo.includes("depósito o un retiro"), r);
  esperar("un egreso que ya es gasto no se deposita", r.ok && depGasto.includes("es un gasto"), r);
  esperar("el egreso marcado «no es gasto: depósito» se toma (con el egreso basta: el origen es su cajón) y la marca se revierte", r.ok && revertida === "t", r);
  esperar("y el banco elegido sube", r.ok && ibk === "120.00", r);
  esperar("marcado como otra cosa (ajuste), no se toma", r.ok && otraMarca.includes("como otra cosa"), r);
  esperar("el monto tiene que ser el del egreso", r.ok && (otroMonto.includes("no coincide") || otroMonto.includes("como otra cosa")), r);
}

// 4. Abono de tarjeta: por abonar → banco, la comisión es un gasto 639 de la empresa y se anula con su abono.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('abono_tarjeta', 950, :'pos', :'bcp', retail.fn_hoy_lima() - 1, 'Liquidación 23', 50) as m \\gset
select pg_temp.saldo(:'pos'), pg_temp.saldo(:'bcp');
select g.categoria, c.cuenta_pcge, g.monto_total, g.ubicacion_id is null, g.estado from retail.movimientos_dinero d join retail.gastos g on g.id = d.gasto_comision_id join retail.categorias_gasto c on c.codigo = g.categoria where d.id = :'m';
select gasto_comision_id as gc from retail.movimientos_dinero where id = :'m' \\gset
select pg_temp.intento(format('select retail.anular_gasto(%L, ''no'')', :'gc'));
select ultimo_abono = retail.fn_hoy_lima() - 1 from retail.fn_cuentas_dinero_saldos() where id = :'pos';
select retail.anular_movimiento_dinero(:'m', 'Se registró con el monto equivocado') as _a \\gset
select pg_temp.saldo(:'pos'), pg_temp.saldo(:'bcp');
select estado from retail.gastos where id = :'gc';
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''abono_tarjeta'', 10, %L, %L)', :'pos', :'fuerte_tru'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 10, %L, %L, null, null, 5)', :'fuerte_tru', :'bcp'));`);
  const [saldos, gasto, anularGasto, ultimoAbono, trasAnular, gastoAnulado, aCajaFuerte, comisionEnDeposito] = lineas(r);
  esperar("el POS baja monto + comisión (1,000) y el banco sube lo que llegó (950)", r.ok && saldos === "0.00|1950.00", r);
  esperar("la comisión es un gasto de «Comisiones y gastos bancarios» (639) de la empresa", r.ok && gasto === "gastos_bancarios|639|50.00|t|vigente", r);
  esperar("la comisión no se anula sola desde Gastos", r.ok && anularGasto.includes("comisión de un abono"), r);
  esperar("la cuenta del POS sabe cuándo fue su último abono", r.ok && ultimoAbono === "t", r);
  esperar("anulado el abono, los saldos vuelven", r.ok && trasAnular === "1000.00|1000.00", r);
  esperar("y su comisión queda anulada", r.ok && gastoAnulado === "anulado", r);
  esperar("un abono solo va a un banco", r.ok && aCajaFuerte.includes("no va entre esas cuentas"), r);
  esperar("solo el abono lleva comisión", r.ok && comisionEnDeposito.includes("Solo el abono"), r);
}

// 5. Tarjeta de crédito, entre cuentas y caja fuerte → banco.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('pago_tarjeta', 300, :'bcp', :'visa') as _p \\gset
select pg_temp.saldo(:'visa'), pg_temp.saldo(:'bcp');
select retail.registrar_gasto(null, 'servicios_basicos', 'Software', retail.fn_hoy_lima(), 100, null, 'tarjeta') as g \\gset
select pg_temp.saldo(:'visa');
select retail.registrar_movimiento_dinero('entre_cuentas', 400, :'bcp', :'ibk') as _e \\gset
select pg_temp.saldo(:'bcp'), pg_temp.saldo(:'ibk');
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''entre_cuentas'', 10, %L, %L)', :'bcp', :'bcp'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''entre_cuentas'', 10, %L, %L)', :'bcp', :'fuerte_tru'));
select retail.cerrar_caja(:'caja', 700, 450, 'caja_fuerte', null) as _c \\gset
select pg_temp.saldo(:'fuerte_tru'), pg_temp.saldo(:'cajon_tru');
select retail.registrar_movimiento_dinero('deposito', 400, :'fuerte_tru', :'bcp', null, 'op 55') as _d \\gset
select pg_temp.saldo(:'fuerte_tru'), pg_temp.saldo(:'bcp');
select abierta, fondo from retail.fn_efectivo_por_tienda(:'tru');
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 10, %L, %L, retail.fn_hoy_lima() + 1)', :'fuerte_tru', :'bcp'));`);
  const [pago, conGasto, entre, mismo, bancoACaja, cierre, deposito, efectivoCerrada, futura] = lineas(r);
  esperar("pagar la tarjeta baja la deuda (−500 → −200) y el BCP", r.ok && pago === "-200.00|700.00", r);
  esperar("un gasto con tarjeta sube la deuda", r.ok && conGasto === "-300.00", r);
  esperar("entre cuentas: sale de uno, entra al otro", r.ok && entre === "300.00|400.00", r);
  esperar("no se mueve plata de una cuenta a sí misma", r.ok && mismo.length > 0 && mismo !== "SIN_ERROR", r);
  esperar("entre cuentas es de banco a banco", r.ok && bancoACaja.includes("no va entre esas cuentas"), r);
  esperar("el cierre con traslado a la caja fuerte la sube; el cajón queda con el fondo", r.ok && cierre === "450.00|250.00", r);
  esperar("de la caja fuerte al banco", r.ok && deposito === "50.00|700.00", r);
  esperar("sin caja abierta, Efectivo por tienda dice lo que quedó", r.ok && efectivoCerrada === "f|250.00", r);
  esperar("la fecha no puede ser futura", r.ok && futura.includes("futura"), r);
}

// 6. La plata del dueño: aporte, préstamo, devolución (tope: lo que CAYLA debe) y retiro.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('aporte', 1000, null, :'bcp') as _a \\gset
select retail.registrar_movimiento_dinero('prestamo', 2000, null, :'bcp', null, 'Para la mercadería de invierno') as pr \\gset
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''devolucion_prestamo'', 2500, %L)', :'bcp'));
select retail.registrar_movimiento_dinero('devolucion_prestamo', 500, :'bcp') as dv \\gset
select pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, ''error'')', :'pr'));
select retail.registrar_movimiento_dinero('retiro', 100, :'bcp') as _r \\gset
select pg_temp.saldo(:'bcp');
select string_agg(tipo || ':' || monto, ',' order by tipo) from retail.fn_plata_del_dueno();
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 10, null, %L)', :'cajon_tru'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 10, %L, %L)', :'ibk', :'bcp'));`);
  const [tope, conDevolucion, saldo, lista, aCajon, conOrigen] = lineas(r);
  esperar("una devolución no pasa lo que CAYLA le debe al dueño", r.ok && tope.includes("CAYLA te debe"), r);
  esperar("un préstamo con devoluciones no se anula antes que ellas", r.ok && conDevolucion.includes("anula primero las devoluciones"), r);
  esperar("aporte y préstamo suben el banco; devolución y retiro lo bajan", r.ok && saldo === "3400.00", r);
  esperar("la plata del dueño lista las cuatro", r.ok && lista === "aporte:1000.00,devolucion_prestamo:500.00,prestamo:2000.00,retiro:100.00", r);
  esperar("la plata del dueño no entra directo al cajón (eso es un ingreso de caja)", r.ok && aCajon.includes("no va entre esas cuentas"), r);
  esperar("un aporte no tiene cuenta de origen", r.ok && conOrigen !== "SIN_ERROR", r);
}

// 7. Cobros según «a qué cuenta entra»: con vigencia; lo que no tiene cuenta se dice aparte. Pagos por su medio.
{
  const r = correr(`${ESCENA}
select coalesce((select monto from retail.fn_dinero_sin_cuenta(retail.fn_hoy_lima() - 10) where origen = 'cobros'), 0) as sin_antes \\gset
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', now() - interval '3 days') returning id as v1 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'yape', 80), (:'v1', 'efectivo', 20);
select coalesce((select monto from retail.fn_dinero_sin_cuenta(retail.fn_hoy_lima() - 10) where origen = 'cobros'), 0) - :'sin_antes';
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'bcp') as _g \\gset
select pg_temp.saldo(:'bcp');
select retail.guardar_medio_de_cobro(:'tru', 'yape', :'ibk') as _g2 \\gset
insert into retail.ventas (ubicacion_id) values (:'tru') returning id as v2 \\gset
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v2', 'yape', 45);
select pg_temp.saldo(:'bcp'), pg_temp.saldo(:'ibk');
select cuenta_nombre from retail.fn_medios_de_cobro() where ubicacion_id = :'tru' and medio = 'yape';
select retail.guardar_medio_de_cobro(:'tru', 'transferencia', :'bcp') as _g3 \\gset
select pg_temp.saldo(:'bcp') as bcp_antes \\gset
select retail.registrar_gasto(:'tru', 'transporte', 'Envío por transferencia', retail.fn_hoy_lima(), 30, null, 'transferencia') as g \\gset
select :'bcp_antes' - pg_temp.saldo(:'bcp');
select pg_temp.intento(format('select retail.guardar_medio_de_cobro(%L, ''tarjeta'', %L)', :'tru', :'fuerte_tru'));
select pg_temp.intento(format('select retail.archivar_cuenta_dinero(%L)', :'ibk'));
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'v2';
select pg_temp.saldo(:'ibk');`);
  const [sinCuenta, conBcp, vigencia, hoyVa, conPago, tarjetaAFuerte, archivar, anulada] = lineas(r);
  esperar("un cobro con Yape sin cuenta configurada queda «sin cuenta» (y se dice)", r.ok && sinCuenta === "80.00", r);
  esperar("la primera vez que se configura, vale para lo anterior: el BCP suma el Yape", r.ok && conBcp === "1080.00", r);
  esperar("cambiarla desde hoy no mueve lo pasado: el Yape de hace 3 días sigue en el BCP, el de hoy entra a Interbank", r.ok && vigencia === "1080.00|45.00", r);
  esperar("«a qué cuenta entra» dice la de hoy", r.ok && hoyVa === "Interbank prueba F3", r);
  esperar("un gasto pagado por transferencia sale del banco de las transferencias de su tienda", r.ok && conPago === "30.00", r);
  esperar("la tarjeta no entra a una caja fuerte", r.ok && tarjetaAFuerte.includes("por abonar"), r);
  esperar("una cuenta a la que hoy entran cobros no se archiva", r.ok && archivar.includes("Hoy entran cobros"), r);
  esperar("una venta anulada ya no suma en el banco", r.ok && anulada === "0.00", r);
}

// 8. Se anula con motivo; no se borra ni se edita; lo anulado se queda a la vista y deja de sumar.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'bcp', null, null, 0, null, :'egreso') as m \\gset
select pg_temp.intento(format('delete from retail.movimientos_dinero where id = %L', :'m'));
select pg_temp.intento(format('update retail.movimientos_dinero set monto = 1 where id = %L', :'m'));
select pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, '' '')', :'m'));
select retail.anular_movimiento_dinero(:'m', 'Era de otra tienda') as _a \\gset
select estado, motivo_anulacion, puede_anular from retail.fn_movimientos_dinero(:'tru') where id = :'m';
select pg_temp.saldo(:'bcp');
select count(*) from retail.fn_egresos_sin_clasificar(:'tru') where id = :'egreso';
select pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, ''otra vez'')', :'m'));
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'ibk', null, null, 0, null, :'egreso') is not null;`);
  const [borrar, editar, sinMotivo, lista, saldo, vuelve, dosVeces, reusar] = lineas(r);
  esperar("un movimiento no se borra", r.ok && borrar.includes("no se borra"), r);
  esperar("ni se edita", r.ok && editar.includes("no se edita"), r);
  esperar("se anula con motivo", r.ok && sinMotivo.includes("por qué"), r);
  esperar("anulado, se queda en la lista con su motivo", r.ok && lista === "anulado|Era de otra tienda|f", r);
  esperar("y deja de sumar", r.ok && saldo === "1000.00", r);
  esperar("su egreso vuelve a «por clasificar» (la plata sí salió del cajón)", r.ok && Number(vuelve) === 1, r);
  esperar("no se anula dos veces", r.ok && dosVeces.includes("ya estaba anulado"), r);
  esperar("el egreso liberado se puede depositar de nuevo, bien", r.ok && reusar === "t", r);
}

// 9. Decisión B: con el módulo, su tienda y solo depósitos; sin él, nada. Nadie lee las tablas directo.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('entre_cuentas', 100, :'bcp', :'ibk') as _e \\gset
${cambiaA(MICAELA)}
select pg_temp.intento('select count(*) from retail.fn_cuentas_dinero_saldos()');
${conModulo("cuentas_dinero")}
select string_agg(tipo || ':' || coalesce(saldo::text, 'sin saldo'), ',' order by tipo) from retail.fn_cuentas_dinero_saldos() where not solo_destino;
select count(*), bool_and(saldo is null) from retail.fn_cuentas_dinero_saldos() where solo_destino;
select count(*) from retail.fn_cuentas_dinero_saldos() where ubicacion_id = :'lim';
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'bcp', null, null, 0, null, :'egreso') as mm \\gset
select count(*), bool_and(ubicacion_id = :'tru') from retail.fn_movimientos_dinero();
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''deposito'', 10, %L, %L, null, null, 0, %L)', :'cajon_lim', :'bcp', :'caja'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''entre_cuentas'', 10, %L, %L)', :'bcp', :'ibk'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 10, null, %L)', :'bcp'));
select pg_temp.intento(format('select retail.fn_conciliacion(%L)', :'bcp'));
select pg_temp.intento('select count(*) from retail.fn_plata_del_dueno()');
select pg_temp.intento(format('select retail.crear_cuenta_dinero(''Otra'', ''banco'')'));
select pg_temp.intento(format('select retail.guardar_medio_de_cobro(%L, ''yape'', %L)', :'tru', :'bcp'));
select pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, ''error'')', :'mm'));
set local role authenticated;
select pg_temp.intento('select count(*) from retail.cuentas_dinero');
select pg_temp.intento('select count(*) from retail.movimientos_dinero');
select pg_temp.intento('select count(*) from retail.medios_de_cobro');
select pg_temp.intento('select count(*) from retail.conciliaciones');
select pg_temp.intento('select count(*) from retail.fn_dinero_libro(retail.fn_hoy_lima())');`);
  const L = lineas(r);
  const [sinModulo, propias, destinos, deLima, visibles, otraTienda, entre, aporte, conciliar, dueno, crear, medio, anular, ...directo] = L;
  esperar("sin el módulo no ve cuentas", r.ok && sinModulo.includes("módulo Cuentas y dinero"), r);
  esperar("con el módulo ve SU cajón y SU caja fuerte", r.ok && /^caja_fuerte:[-0-9.]+,cajon:[-0-9.]+$/.test(propias), r);
  esperar("los bancos, solo como destino y sin saldo", r.ok && /^\d+\|t$/.test(destinos) && Number(destinos.split("|")[0]) >= 2, r);
  esperar("nada de otra tienda", r.ok && deLima === "0", r);
  esperar("ve solo los movimientos de su tienda", r.ok && visibles === "1|t", r);
  esperar("no deposita el cajón de otra tienda", r.ok && otraTienda.includes("lo de tu tienda"), r);
  esperar("entre cuentas es del líder", r.ok && entre.includes("solo registra depósitos"), r);
  esperar("la plata del dueño es del líder", r.ok && aporte.includes("solo registra depósitos"), r);
  esperar("conciliar es del líder", r.ok && conciliar.includes("solo del líder"), r);
  esperar("ver la plata del dueño es del líder", r.ok && dueno.includes("solo del líder"), r);
  esperar("agregar cuentas es del líder", r.ok && crear.includes("solo del líder"), r);
  esperar("decir a qué cuenta entra cada cobro es del líder", r.ok && medio.includes("solo del líder"), r);
  esperar("anula su propio depósito", r.ok && anular === "SIN_ERROR", r);
  esperar("nadie lee las tablas directo (cuentas, movimientos, medios, conciliaciones) ni el libro", r.ok && directo.length === 5 && directo.every((d) => d.includes("permission denied")), r);
}

// 10. Conciliación: la diferencia con el banco, las líneas del período y las revisadas.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'bcp', null, 'V-1', 0, null, :'egreso') as m \\gset
select retail.registrar_movimiento_dinero('entre_cuentas', 100, :'bcp', :'ibk', retail.fn_hoy_lima() - 2) as e \\gset
select (retail.fn_conciliacion(:'bcp'))->>'saldo_sistema', jsonb_array_length((retail.fn_conciliacion(:'bcp'))->'lineas');
select pendientes from retail.fn_conciliacion_cuentas() where id = :'bcp';
select retail.registrar_conciliacion(:'bcp', retail.fn_hoy_lima(), 1150, 'banca por internet') as c \\gset
select (x->'conciliacion'->>'diferencia')::numeric, x->'conciliacion'->>'saldo_sistema' from retail.fn_conciliacion(:'bcp') x;
select pg_temp.intento(format('select retail.registrar_conciliacion(%L, retail.fn_hoy_lima(), 1200)', :'bcp'));
select retail.marcar_revisados_dinero(:'bcp', (select jsonb_agg(jsonb_build_object('clave', l->>'clave', 'monto', l->>'monto')) from jsonb_array_elements((retail.fn_conciliacion(:'bcp'))->'lineas') l)) as _m1 \\gset
select count(*) filter (where (l->>'revisado')::boolean) from jsonb_array_elements((retail.fn_conciliacion(:'bcp'))->'lineas') l;
select pendientes, ultima_fecha = retail.fn_hoy_lima(), ultima_diferencia from retail.fn_conciliacion_cuentas() where id = :'bcp';
select retail.marcar_revisados_dinero(:'bcp', jsonb_build_array(jsonb_build_object('clave', 'mov:' || :'m', 'monto', 999))) as _m2 \\gset
select (l->>'revisado')::boolean, l->>'monto_revisado' from jsonb_array_elements((retail.fn_conciliacion(:'bcp'))->'lineas') l where l->>'clave' = 'mov:' || :'m';
select pg_temp.intento(format('delete from retail.conciliaciones where id = %L', :'c'));
select retail.anular_conciliacion(:'c', 'Me equivoqué de cifra') as _a \\gset
select (retail.fn_conciliacion(:'bcp'))->'conciliacion' is null or (retail.fn_conciliacion(:'bcp'))->>'conciliacion' is null;
select pg_temp.intento(format('select retail.fn_conciliacion(%L)', :'cajon_tru'));`);
  const [sistema, pendAntes, dif, dosVeces, revisadas, pendDespues, cambio, borrar, anulada, cajon] = lineas(r);
  esperar("el sistema dice 1,000 + 300 − 100 = 1,200, con 2 líneas en el período", r.ok && sistema === "1200.00|2", r);
  esperar("2 líneas por revisar", r.ok && pendAntes === "2", r);
  esperar("el banco dice 1,150: diferencia −50 contra 1,200", r.ok && dif === "-50.00|1200.00", r);
  esperar("un solo saldo del banco por día", r.ok && dosVeces.includes("Ya anotaste"), r);
  esperar("las líneas se marcan revisadas", r.ok && revisadas === "2", r);
  esperar("y el período queda sin pendientes; la cuenta recuerda la última diferencia", r.ok && pendDespues === "0|t|-50.00", r);
  esperar("si el monto de una línea cambia desde que se revisó, vuelve a pedirse", r.ok && cambio === "f|999.00", r);
  esperar("una conciliación no se borra", r.ok && borrar.includes("no se borra"), r);
  esperar("se anula con motivo", r.ok && anulada === "t", r);
  esperar("un cajón no se concilia contra un banco", r.ok && cajon.includes("Solo se concilian"), r);
}

console.log(fallos ? `\n${fallos} de ${casos} caso(s) fallaron` : `\nTodo en orden (${casos} casos)`);
process.exit(fallos ? 1 : 0);
