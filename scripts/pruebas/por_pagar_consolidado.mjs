#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F4 — Por pagar consolidado (`20260925120000_finanzas_por_pagar_consolidado.sql`).
 *
 * EL CASO. CAYLA debe cinco cosas a la vez: una factura de mercadería repartida mitad Trujillo, mitad Lima; la luz de
 * Trujillo a crédito (un gasto con factura); un mostrador de Lima a crédito (un activo); el contador, que no es de ninguna
 * tienda (recibo por honorarios, «de la empresa», vencido); y la tela del Taller (un comprobante de Producción).
 *
 * QUÉ CUBRE
 *   · «Todas»: las cinco, una fila por comprobante entero, con su naturaleza, qué fue, sus unidades y la suma exacta;
 *   · «Una tienda»: la parte de esa tienda (ADR-0139/0187); el Taller ve la tela; «la empresa», solo lo que no es de ninguna;
 *   · `p_hasta`: solo lo que vence hasta esa fecha;
 *   · lo anulado no cuenta; lo pagado no aparece; un pago parcial deja el saldo; el pago de una tienda baja solo su parte;
 *   · permisos: sin módulo, error; `por_pagar` (Compras) no abre esta lectura; con `cuentas_dinero`, solo su tienda y sin
 *     la tela del Taller; anon no la puede llamar.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK y la sesión simulada con
 * `request.jwt.claim.sub`. La base local tiene deudas de otras sesiones: cada caso mira solo los comprobantes que crea.
 *
 * USO
 *   pnpm pruebas:por-pagar-consolidado    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Un deadlock o un candado con otra sesión que prueba a la vez se reintenta; cualquier otro error es el resultado.
function correr(sql) {
  let ultimo;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
    } catch (e) {
      ultimo = { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
      if (!/deadlock detected|lock timeout|could not obtain lock/i.test(ultimo.mensaje)) return ultimo;
      pausa(400 * intento);
    }
  }
  return ultimo;
}
const cambiaA = (id) => `reset role;\nset local request.jwt.claim.sub = '${id}';\n`;
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

/**
 * Las cinco deudas, registradas con las RPC reales como el líder. Deja `:f1` (mercadería 12/12 TRU-LIM, S/ 1,416, vence en
 * 10 días), `:g1` y `:cg` (la luz de TRU, S/ 612, vence en 4), `:a1` y `:ca` (mostrador de LIM, S/ 1,180, vence en 20),
 * `:h1` y `:ch` (el contador, de la empresa, S/ 800, venció hace 2) y `:k1` (tela del Taller, S/ 1,180, vence en 12).
 */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by created_at limit 1 \\gset
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.proveedores (nombre, activo) values ('Servicios F4 (prueba)', true) returning id as prov2 \\gset
select retail.registrar_compra(:'prov1', 'TST', 'F4' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9), 'credito', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'tru', 'cantidad', 12), jsonb_build_object('ubicacion_id', :'lim', 'cantidad', 12)))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as f1 \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de agosto', retail.fn_hoy_lima() - 5, 612,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov2', 'serie', 'S120', 'numero', '554120', 'condicion', 'credito', 'fecha_vencimiento', retail.fn_hoy_lima() + 4)) as g1 \\gset
select compra_id as cg from retail.gastos where id = :'g1' \\gset
select retail.registrar_activo(:'lim', 'muebles', 'Mostrador de caja', retail.fn_hoy_lima() - 1, 1180,
  jsonb_build_object('tipo', 'factura', 'proveedor_id', :'prov2', 'serie', 'F001', 'numero', '131', 'condicion', 'credito', 'fecha_vencimiento', retail.fn_hoy_lima() + 20)) as a1 \\gset
select compra_id as ca from retail.activos_fijos where id = :'a1' \\gset
select retail.registrar_gasto(null, 'asesoria', 'Contador de agosto', retail.fn_hoy_lima() - 10, 800,
  jsonb_build_object('tipo', 'recibo_por_honorarios', 'proveedor_id', :'prov2', 'serie', 'E001', 'numero', '77', 'condicion', 'credito', 'fecha_vencimiento', retail.fn_hoy_lima() - 2)) as h1 \\gset
select compra_id as ch from retail.gastos where id = :'h1' \\gset
select retail.guardar_proveedor_produccion(null, 'Tejidos F4 (prueba)', 'tela') as provt \\gset
select retail.registrar_comprobante_produccion(:'provt', 'F005', '341', 'credito', '[{"descripcion":"Lino","cantidad":100,"costo_unitario":10}]'::jsonb,
  p_fecha_emision => retail.fn_hoy_lima() - 3, p_fecha_vencimiento => retail.fn_hoy_lima() + 12) as k1 \\gset
`;
/** Lo que devuelve la lectura, solo de los cinco comprobantes de la escena. */
const MIAS = `id in (:'f1', :'cg', :'ca', :'ch', :'k1')`;
const LEER = (args = "") => `select origen, naturaleza, coalesce(concepto, '-'), coalesce(unidades, '-'), parte, total, pagado, saldo, vence - retail.fn_hoy_lima()
  from retail.fn_por_pagar_consolidado(${args}) where ${MIAS} order by vence, documento;`;
const SUMA = (args = "") => `select count(*), coalesce(sum(saldo), 0) from retail.fn_por_pagar_consolidado(${args}) where ${MIAS};`;
const COMO_MICAELA = `${cambiaA(MICAELA)}set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n`;
/** Le da (dentro de la transacción) esos módulos al rol «integrante», que es el de Micaela, y solo esos de los que importan. */
const MODULOS = (...claves) => `reset role;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo in ('cuentas_dinero', 'por_pagar', 'facturas_compra', 'notas_credito');
${claves.map((c) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${c}');`).join("\n")}
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);

// 1. «Todas»: las cinco, enteras, con su naturaleza, lo que fueron y sus unidades; la suma es lo que CAYLA debe.
{
  const r = correr(`${ESCENA}${LEER()}${SUMA()}`);
  const l = lineas(r);
  esperar("el contador (de la empresa) va primero: venció hace 2 días, sin unidad", r.ok && l[0] === "compras|gasto|Contador de agosto|-|f|800.00|0.00|800.00|-2", r);
  esperar("la luz de Trujillo: gasto a crédito, dice qué fue, vence en 4", r.ok && l[1] === "compras|gasto|Luz de agosto|Tienda Trujillo|f|612.00|0.00|612.00|4", r);
  esperar("la mercadería repartida sale ENTERA en una fila, con las dos tiendas", r.ok && l[2] === "compras|mercaderia|-|Tienda Lima · Tienda Trujillo|f|1416.00|0.00|1416.00|10", r);
  esperar("la tela del Taller está en la misma lista (su propio libro, ADR-0133)", r.ok && /^produccion\|insumo\|-\|Taller\|f\|1180.00\|0.00\|1180.00\|12$/.test(l[3] ?? ""), r);
  esperar("el mostrador de Lima: activo fijo, con su nombre", r.ok && l[4] === "compras|activo|Mostrador de caja|Tienda Lima|f|1180.00|0.00|1180.00|20", r);
  esperar("cinco comprobantes, S/ 5,188 en total: los tres libros sumados", r.ok && l[5] === "5|5188.00", r);
}

// 2. Una unidad: la parte de cada tienda; el Taller ve la tela; «la empresa», solo lo que no es de ninguna.
{
  const r = correr(`${ESCENA}
select string_agg(naturaleza || ':' || saldo || ':' || parte, ',' order by vence) from retail.fn_por_pagar_consolidado(:'tru') where ${MIAS};
select string_agg(naturaleza || ':' || saldo, ',' order by vence) from retail.fn_por_pagar_consolidado(:'lim') where ${MIAS};
select string_agg(naturaleza || ':' || saldo, ',' order by vence) from retail.fn_por_pagar_consolidado(:'taller') where ${MIAS};
select string_agg(naturaleza || ':' || saldo || ':' || coalesce(ubicacion_id::text, 'empresa'), ',' order by vence) from retail.fn_por_pagar_consolidado(null, null, true) where ${MIAS};
select unidades from retail.fn_por_pagar_consolidado(:'tru') where id = :'f1';`);
  const [tru, lim, taller, empresa, unidad] = lineas(r);
  esperar("Trujillo: la luz entera y SU mitad de la mercadería (S/ 708), marcada como parte", r.ok && tru === "gasto:612.00:true,mercaderia:708.00:true", r);
  esperar("Lima: su mitad y su mostrador; ni la luz de Trujillo ni el contador", r.ok && lim === "mercaderia:708.00,activo:1180.00", r);
  esperar("el Taller: la tela", r.ok && taller === "insumo:1180.00", r);
  esperar("la empresa: solo el contador, sin tienda", r.ok && empresa === "gasto:800.00:empresa", r);
  esperar("la parte dice de qué tienda es", r.ok && unidad === "Tienda Trujillo", r);
}

// 3. `p_hasta`: lo que vence hasta esa fecha (lo vencido incluido).
{
  const r = correr(`${ESCENA}${SUMA("null, retail.fn_hoy_lima() + 7")}${SUMA("null, retail.fn_hoy_lima() + 12")}${SUMA(":'tru', retail.fn_hoy_lima() + 7")}`);
  const [semana, doce, truSemana] = lineas(r);
  esperar("hasta dentro de 7 días: el contador vencido y la luz (S/ 1,412)", r.ok && semana === "2|1412.00", r);
  esperar("hasta dentro de 12: suman la mercadería y la tela (S/ 4,008)", r.ok && doce === "4|4008.00", r);
  esperar("Trujillo esta semana: solo la luz", r.ok && truSemana === "1|612.00", r);
}

// 4. Lo anulado no cuenta.
{
  const r = correr(`${ESCENA}
select retail.anular_gasto(:'g1', 'factura mal registrada');
select retail.anular_compra(:'f1', 'el proveedor la reemplazó');
select retail.anular_comprobante_produccion(:'k1', 'mal digitado');
${SUMA()}
select string_agg(naturaleza, ',' order by vence) from retail.fn_por_pagar_consolidado() where ${MIAS};
select retail.anular_activo(:'a1', 'registrado dos veces');
${SUMA()}`);
  const [suma, quedan, sinActivo] = lineas(r);
  esperar("anulados la luz, la mercadería y la tela: solo quedan el contador y el mostrador", r.ok && suma === "2|1980.00" && quedan === "gasto,activo", r);
  esperar("anulado el mostrador (con su factura), solo queda el contador", r.ok && sinActivo === "1|800.00", r);
}

// 5. Lo pagado no aparece; el pago parcial deja el saldo; el pago de una tienda baja solo su parte.
{
  const r = correr(`${ESCENA}
select retail.registrar_pagos_compra(:'cg', jsonb_build_array(jsonb_build_object('monto', 612, 'metodo', 'transferencia'))) as _p1 \\gset
select retail.registrar_pago_comprobante_produccion(:'k1', '[{"metodo":"transferencia","monto":500}]'::jsonb) as _p2 \\gset
select retail.registrar_pagos_compra(:'f1', jsonb_build_array(jsonb_build_object('monto', 708, 'metodo', 'transferencia')), null, null, :'tru') as _p3 \\gset
select count(*) from retail.fn_por_pagar_consolidado() where id = :'cg';
select total, pagado, saldo from retail.fn_por_pagar_consolidado() where id = :'k1';
select total, pagado, saldo from retail.fn_por_pagar_consolidado() where id = :'f1';
select count(*) from retail.fn_por_pagar_consolidado(:'tru') where id = :'f1';
select total, pagado, saldo from retail.fn_por_pagar_consolidado(:'lim') where id = :'f1';
${SUMA()}`);
  const [luz, tela, entera, truParte, limParte, suma] = lineas(r);
  esperar("la luz pagada ya no aparece", r.ok && luz === "0", r);
  esperar("la tela con S/ 500 pagados: queda S/ 680", r.ok && tela === "1180.00|500.00|680.00", r);
  esperar("la mercadería con la parte de Trujillo pagada: entera, debe S/ 708", r.ok && entera === "1416.00|708.00|708.00", r);
  esperar("Trujillo ya no la debe", r.ok && truParte === "0", r);
  esperar("Lima sigue debiendo su mitad", r.ok && limParte === "708.00|0.00|708.00", r);
  esperar("el total baja exactamente lo pagado (S/ 5,188 − 612 − 500 − 708 = S/ 3,368)", r.ok && suma === "4|3368.00", r);
}

// 6. Permisos: sin módulo, error; `por_pagar` no abre esta lectura; con `cuentas_dinero`, solo su tienda; anon, nada.
{
  const r = correr(`${ESCENA}
${MODULOS()}${COMO_MICAELA}
select pg_temp.intento('select * from retail.fn_por_pagar_consolidado()');
${MODULOS("por_pagar")}${COMO_MICAELA}
select pg_temp.intento('select * from retail.fn_por_pagar_consolidado()');
${MODULOS("cuentas_dinero")}${COMO_MICAELA}
select string_agg(naturaleza || ':' || saldo || ':' || parte, ',' order by vence) from retail.fn_por_pagar_consolidado() where ${MIAS};
select count(*) from retail.fn_por_pagar_consolidado(:'lim') where ${MIAS};
select count(*) from retail.fn_por_pagar_consolidado(null, null, true) where ${MIAS};
select count(*) from retail.fn_por_pagar_consolidado(:'taller') where ${MIAS};
select string_agg(naturaleza, ',' order by vence) from retail.fn_por_pagar_consolidado(:'tru') where ${MIAS};
reset role;
set local role anon;
select pg_temp.intento('select * from retail.fn_por_pagar_consolidado()');`);
  const [sin, porPagar, suya, lima, empresa, taller, pedida, anon] = lineas(r);
  esperar("sin el módulo, la base lo dice", r.ok && sin.includes("módulo Cuentas y dinero"), r);
  esperar("con Por pagar de Compras (y no Cuentas y dinero), tampoco: cada módulo abre su pantalla", r.ok && porPagar.includes("módulo Cuentas y dinero"), r);
  esperar("con Cuentas y dinero: solo lo de su tienda, la luz y SU mitad", r.ok && suya === "gasto:612.00:true,mercaderia:708.00:true", r);
  esperar("pedir Lima no devuelve nada", r.ok && lima === "0", r);
  esperar("ni lo de la empresa", r.ok && empresa === "0", r);
  esperar("ni la tela del Taller", r.ok && taller === "0", r);
  esperar("pedir su propia tienda da lo mismo", r.ok && pedida === "gasto,mercaderia", r);
  esperar("anon no la puede llamar", r.ok && anon.includes("permission denied"), r);
}

// 7. El líder no pierde nada que Compras y Producción ya muestran: la suma de «todas» cuadra con sus propias lecturas.
{
  const r = correr(`${ESCENA}
select (select coalesce(sum(saldo), 0) from retail.fn_por_pagar_consolidado() where origen = 'compras')
     = (select coalesce(sum(saldo), 0) from retail.compras where estado = 'vigente' and saldo > 0);
select (select coalesce(sum(saldo), 0) from retail.fn_por_pagar_consolidado() where origen = 'produccion')
     = (select coalesce(sum(saldo), 0) from retail.fn_comprobantes_produccion() where estado = 'vigente');
select (select coalesce(sum(saldo), 0) from retail.fn_por_pagar_consolidado()) = (select coalesce(sum(saldo), 0) from retail.fn_deuda_consolidada());`);
  const [compras, produccion, consolidada] = lineas(r);
  esperar("lo de Compras cuadra con todas sus facturas vigentes con saldo (las tres naturalezas)", r.ok && compras === "t", r);
  esperar("lo del Taller cuadra con Producción ▸ Por pagar", r.ok && produccion === "t", r);
  esperar("y el total, con la deuda consolidada por proveedor de ADR-0133 (D-I)", r.ok && consolidada === "t", r);
}

console.log(fallos ? `\n${fallos} de ${casos} caso(s) fallaron` : `\nTodo en orden (${casos} casos)`);
process.exit(fallos ? 1 : 0);
