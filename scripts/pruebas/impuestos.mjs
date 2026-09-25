#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F8 — Impuestos (`20260925140000_finanzas_impuestos.sql`).
 *
 * QUÉ CUBRE
 *   · débito del mes: boletas, facturas y la que sigue en camino; la nota de crédito resta; NO cuentan los anulados, los
 *     rechazados, los del ambiente de pruebas de SUNAT (sandbox) ni las notas de venta;
 *   · crédito del mes: facturas de mercadería, gastos, activos y del Taller, menos la nota de crédito del proveedor; las
 *     boletas y los recibos por honorarios no dan crédito; la compra anulada no está;
 *   · el saldo a favor se arrastra de un mes al siguiente (y aunque se pida un solo mes);
 *   · la pantalla en una lectura: lo que conviene revisar, el pago a cuenta y el límite de ventas (12 meses) contra el
 *     umbral en UIT;
 *   · parámetros con vigencia: se agregan, se corrigen con una fila nueva (gana la más reciente), se validan, quedan en la
 *     historia de Configuración y nunca se editan ni se borran;
 *   · permisos: solo el líder (el módulo no es delegable: la base ni deja dárselo a un rol); nadie lee la tabla directo;
 *   · los registros de ventas y de compras para el contador, con sus columnas.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK (la base local es
 * compartida), sesión simulada con `request.jwt.claim.sub`. Los meses de prueba son de 2024: no hay datos reales ahí, así
 * que el saldo a favor arranca en cero y los números son exactos.
 *
 * USO
 *   pnpm pruebas:impuestos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const VARIANTE = "22222222-2222-4222-8222-222222222222"; // una prenda de la semilla

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
// Un comprobante de venta tal como lo deja Facturación (total con IGV; el IGV sale del 18 %).
const COMP = `
create function pg_temp.comp(p_ubic uuid, p_tipo text, p_serie text, p_num int, p_total numeric, p_estado text, p_entorno text,
                             p_dia date, p_original uuid default null, p_venta uuid default null) returns uuid language plpgsql as $f$
declare v_id uuid; v_igv numeric := case when p_tipo = 'nota_venta' then 0 else round(p_total - p_total / 1.18, 2) end;
begin
  insert into retail.comprobantes (ubicacion_id, venta_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
                                   subtotal, igv, total, estado, entorno_transmision, created_at, comprobante_original_id, motivo, motivo_anulacion)
  values (p_ubic, p_venta, p_tipo, p_serie, p_num,
          case when p_tipo in ('factura', 'nota_credito') then 'ruc' else 'dni' end,
          case when p_tipo in ('factura', 'nota_credito') then '20600000001' else '44556677' end, 'Clienta de prueba F8',
          p_total - v_igv, v_igv, p_total, p_estado, p_entorno, (p_dia + time '12:00') at time zone 'America/Lima', p_original,
          case when p_tipo in ('nota_credito', 'nota_debito') then 'Devolución de una prenda' end,
          case when p_estado = 'anulado' then 'Error al digitar' end)
  returning id into v_id;
  return v_id;
end $f$;
`;

/** Enero, febrero y marzo de 2024 en Trujillo, con cada caso que el IGV tiene que distinguir.
 *  Enero — ventas: boleta 118, boleta de una venta 59, factura 236, boleta pendiente 59 y una NC de 59 sobre la factura
 *          (cuentan: IGV 18 + 9 + 36 + 9 − 9 = 63, base S/ 350); boleta anulada 1,180, rechazada 590, del ambiente de
 *          pruebas 354 y una nota de venta de 100 (no cuentan); y una venta de S/ 100 sin comprobante.
 *        — compras: factura de mercadería 1,180 (IGV 180) con NC de 118 (IGV 18), gasto con factura 236 (IGV 36), gasto con
 *          boleta 100, recibo por honorarios 1,600, activo con factura 590 (IGV 90), factura del Taller 59 (IGV 9) y una
 *          compra anulada 590. Crédito: 180 + 36 + 90 + 9 − 18 = 297 → S/ 234 a favor.
 *  Febrero — boleta 1,180 (IGV 180) y factura de mercadería 118 (IGV 18): 180 − 18 − 234 → sigue a favor S/ 72.
 *  Marzo — boleta 1,180 (IGV 180): 180 − 72 = S/ 108 a pagar. */
const ESCENA = `
begin;
${INTENTO}
${COMP}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.proveedores (nombre, ruc, activo) values ('Textiles Prueba F8', '20987650981', true) returning id as prov \\gset
insert into retail.proveedores (nombre, ruc, activo) values ('Bodega Prueba F8', '10987650982', true) returning id as prov2 \\gset
insert into retail.proveedores_produccion (nombre, rubro, ruc) values ('Hilos Prueba F8', 'avios', '20987650983') returning id as provt \\gset

select pg_temp.comp(:'tru', 'boleta',     'B981', 1, 118,  'aceptado',  'produccion', '2024-01-10') as b1 \\gset
select pg_temp.comp(:'tru', 'factura',    'F981', 1, 236,  'aceptado',  'produccion', '2024-01-15') as f1 \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 2, 59,   'pendiente', null,         '2024-01-20') as b2 \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 3, 1180, 'anulado',   'produccion', '2024-01-21') as b3 \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 4, 590,  'rechazado', 'produccion', '2024-01-22') as b4 \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 5, 354,  'aceptado',  'sandbox',    '2024-01-23') as b5 \\gset
select pg_temp.comp(:'tru', 'nota_venta', 'NV98', 1, 100,  'interna',   null,         '2024-01-24') as nv \\gset
select pg_temp.comp(:'tru', 'nota_credito', 'FC98', 1, 59, 'aceptado',  'produccion', '2024-01-28', :'f1') as nc \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 6, 1180, 'aceptado',  'produccion', '2024-02-10') as b6 \\gset
select pg_temp.comp(:'tru', 'boleta',     'B981', 7, 1180, 'aceptado',  'produccion', '2024-03-05') as b7 \\gset

insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'factura', 'F100', '1', '2024-01-05', 'contado', 1000, 180, 1180, :'tru') returning id as merca \\gset
insert into retail.compra_notas_credito (compra_id, serie_numero, fecha, subtotal, igv, monto, motivo, aplicado)
values (:'merca', 'FC01-7', '2024-01-25', 100, 18, 118, 'devolucion', 118);
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id, estado, motivo_anulacion)
values (:'prov', 'factura', 'F100', '2', '2024-01-16', 'contado', 500, 90, 590, :'tru', 'anulada', 'se registró dos veces');
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'factura', 'F100', '3', '2024-02-11', 'contado', 100, 18, 118, :'tru');
select retail.registrar_gasto(:'tru', 'alquileres', 'Alquiler de enero', '2024-01-08', 236, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F200','numero','1','condicion','credito','fecha_vencimiento','2024-02-08')) as gf \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas', '2024-01-09', 100, jsonb_build_object('tipo','boleta','proveedor_id',:'prov2','serie','B300','numero','1','condicion','credito','fecha_vencimiento','2024-02-09')) as gb \\gset
select retail.registrar_gasto(null, 'asesoria', 'Contador de enero', '2024-01-18', 1600, jsonb_build_object('tipo','recibo_por_honorarios','proveedor_id',:'prov2','serie','E001','numero','9','condicion','credito','fecha_vencimiento','2024-02-18')) as rh \\gset
select retail.registrar_activo(:'tru', 'muebles', 'Mostrador', '2024-01-12', 590, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F400','numero','1','condicion','credito','fecha_vencimiento','2024-02-12')) as act \\gset
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total)
values (:'provt', 'factura', 'F500', '1', '2024-01-14', 'contado', 50, 9, 59);

-- Una venta de enero con boleta, y otra sin comprobante (su IGV no está en el débito).
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', '2024-01-11 12:00-05') returning id as vcon \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vcon', '${VARIANTE}', 1, 59, 20);
select pg_temp.comp(:'tru', 'boleta', 'B981', 8, 59, 'aceptado', 'produccion', '2024-01-11', null, :'vcon') as b8 \\gset
insert into retail.ventas (ubicacion_id, created_at) values (:'tru', '2024-01-11 13:00-05') returning id as vsin \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vsin', '${VARIANTE}', 2, 50, 20);
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);
// Sin las líneas que solo traen el id de lo que se acaba de guardar.
const sinIds = (r) => lineas(r).filter((l) => l !== "" && !/^[0-9a-f-]{36}$/.test(l));

// 1. El débito de enero: lo que vale para SUNAT, y solo eso.
{
  const r = correr(`${ESCENA}
select comprobantes, base_ventas, igv_ventas, igv_notas_credito, debito from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31');
select string_agg(distinct x.estado, ',' order by x.estado) from retail.fn_impuestos_ventas('2024-01-01', '2024-01-31') x where x.cuenta;
select count(*) from retail.fn_impuestos_ventas('2024-01-01', '2024-01-31') x where x.comprobante_id in (:'b3', :'b4', :'b5', :'nv') and x.cuenta;
select count(*) from retail.fn_impuestos_ventas('2024-01-01', '2024-01-31') x where x.comprobante_id in (:'b4', :'b5', :'nv');`);
  const [enero, estados, ninguno, fuera] = lineas(r);
  esperar("enero: 5 comprobantes cuentan, base S/ 350, IGV de ventas 72, la nota de crédito resta 9 → débito 63", r.ok && enero === "5|350.00|72.00|9.00|63.00", r);
  esperar("cuentan los aceptados y el que sigue en camino (pendiente)", r.ok && estados === "aceptado,pendiente", r);
  esperar("no cuentan el anulado, el rechazado, el del ambiente de pruebas ni la nota de venta", r.ok && Number(ninguno) === 0, r);
  esperar("el rechazado, el de pruebas y la nota de venta ni siquiera llegan al registro", r.ok && Number(fuera) === 0, r);
}

// 2. El crédito de enero: facturas de las tres naturalezas y del Taller, menos la nota de crédito del proveedor.
{
  const r = correr(`${ESCENA}
select credito_mercaderia, credito_gastos, credito_activos, credito_taller, credito_notas, credito from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31');
select string_agg(x.tipo || ':' || x.da_credito, ',' order by x.tipo) from retail.fn_impuestos_compras('2024-01-01', '2024-01-31') x where x.tipo in ('boleta', 'recibo_por_honorarios');
select count(*) from retail.fn_impuestos_compras('2024-01-01', '2024-01-31') x join retail.compras k on k.id = x.id where k.estado = 'anulada';
select igv from retail.compras where id = (select compra_id from retail.gastos where id = :'gb');`);
  const [enero, boletas, anulada, igvBoleta] = lineas(r);
  esperar("crédito: mercadería 180, gastos 36, activos 90, Taller 9, menos 18 de la nota de crédito = 297", r.ok && enero === "180.00|36.00|90.00|9.00|18.00|297.00", r);
  esperar("la boleta y el recibo por honorarios no dan crédito", r.ok && boletas === "boleta:false,recibo_por_honorarios:false", r);
  esperar("y la boleta no lleva IGV (la base lo impone)", r.ok && Number(igvBoleta) === 0, r);
  esperar("la compra anulada no está", r.ok && Number(anulada) === 0, r);
}

// 3. El saldo a favor se arrastra.
{
  const r = correr(`${ESCENA}
select to_char(mes, 'YYYY-MM'), debito, credito, saldo_anterior, a_pagar, saldo_a_favor from retail.fn_impuestos_igv_meses('2024-01-01', '2024-04-30') order by mes;
select saldo_anterior, a_pagar, saldo_a_favor from retail.fn_impuestos_igv_meses('2024-02-01', '2024-02-29');`);
  const [ene, feb, mar, abr, soloFeb] = lineas(r);
  esperar("enero: el crédito supera al débito → no se paga, quedan S/ 234 a favor", r.ok && ene === "2024-01|63.00|297.00|0|0|234.00", r);
  esperar("febrero: 180 − 18 − 234 → sigue a favor S/ 72", r.ok && feb === "2024-02|180.00|18.00|234.00|0|72.00", r);
  esperar("marzo: 180 − 72 → se pagan S/ 108 y el saldo se acaba", r.ok && mar === "2024-03|180.00|0|72.00|108.00|0", r);
  esperar("abril sin movimiento: nada a pagar ni a favor", r.ok && abr === "2024-04|0|0|0|0|0", r);
  esperar("pedir solo febrero igual trae el saldo de enero", r.ok && soloFeb === "234.00|0|72.00", r);
}

// 4. La pantalla en una lectura: el mes, lo que conviene revisar y el pago a cuenta.
{
  const r = correr(`${ESCENA}
select retail.fn_impuestos_panel('2024-01-15') as p \\gset
select :'p'::jsonb ->> 'mes', :'p'::jsonb -> 'foco' ->> 'debito', :'p'::jsonb -> 'foco' ->> 'saldo_a_favor', jsonb_array_length(:'p'::jsonb -> 'historial');
select :'p'::jsonb -> 'revisar' -> 'boletas';
select :'p'::jsonb -> 'revisar' -> 'sin_aceptar', :'p'::jsonb -> 'revisar' -> 'rechazados';
select :'p'::jsonb -> 'revisar' -> 'sin_comprobante';
select :'p'::jsonb -> 'revisar' -> 'honorarios';
select coalesce(:'p'::jsonb -> 'renta' ->> 'tasa', 'sin tasa'), :'p'::jsonb -> 'renta' ->> 'base';
select retail.fn_impuestos_panel() ->> 'mes' = to_char(date_trunc('month', retail.fn_hoy_lima() - interval '1 month'), 'YYYY-MM-DD');
select retail.fn_impuestos_panel('2099-01-01') ->> 'mes' = to_char(date_trunc('month', retail.fn_hoy_lima()), 'YYYY-MM-DD');`);
  const [cab, boletas, sinAceptar, sinComp, honorarios, renta, porDefecto, futuro] = lineas(r);
  esperar("enero 2024: débito 63, S/ 234 a favor; el historial son los últimos 6 meses", r.ok && cab === "2024-01-01|63.00|234.00|6", r);
  esperar("revisar: 1 boleta de proveedor (un gasto), de «Bodega Prueba F8»", r.ok && boletas === '{"n": 1, "total": 100.00, "gastos": 1, "proveedores": ["Bodega Prueba F8"]}', r);
  esperar("revisar: 1 comprobante sin aceptar (el pendiente) y 1 rechazado", r.ok && sinAceptar === '{"n": 1, "total": 59.00}|{"n": 1, "total": 590.00}', r);
  esperar("revisar: 1 venta sin boleta ni factura, de S/ 100 (la que tiene boleta no sale)", r.ok && sinComp === '{"n": 1, "total": 100.00, "alegra": 0}', r);
  esperar("revisar: 1 recibo por honorarios de más de S/ 1,500", r.ok && honorarios === '{"n": 1, "total": 1600.00, "mayores": 1}', r);
  esperar("sin tasa de pago a cuenta para 2024, no se inventa una (la base del mes sí está)", r.ok && renta === "sin tasa|350.00", r);
  esperar("sin mes, se mira el anterior (el que se declara)", r.ok && porDefecto === "t", r);
  esperar("un mes futuro se lleva al mes en curso", r.ok && futuro === "t", r);
}

// 5. El límite: ventas sin IGV de los últimos 12 meses contra el umbral en UIT.
{
  const r = correr(`${ESCENA}
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_12m')::numeric as antes \\gset
select retail.fn_impuestos_panel() -> 'umbral' ->> 'umbral_soles', retail.fn_impuestos_panel() -> 'umbral' ->> 'cruzado';
select pg_temp.comp(:'tru', 'boleta', 'B982', 1, 11800, 'aceptado', 'produccion', retail.fn_hoy_lima());
select pg_temp.comp(:'tru', 'boleta', 'B982', 2, 11800, 'aceptado', 'produccion', (date_trunc('month', retail.fn_hoy_lima()) - interval '12 months')::date + 3);
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_12m')::numeric - :antes;
select retail.guardar_parametro_tributario('umbral_uit', date_trunc('year', retail.fn_hoy_lima())::date, 1);
select retail.fn_impuestos_panel() -> 'umbral' ->> 'umbral_soles', retail.fn_impuestos_panel() -> 'umbral' ->> 'cruzado',
       (retail.fn_impuestos_panel() -> 'umbral' ->> 'avance')::numeric = round(((retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_12m')::numeric) / 5500, 4);
select jsonb_array_length(retail.fn_impuestos_panel() -> 'umbral' -> 'ventas_meses');`);
  const [inicial, delta, cruzado, meses] = sinIds(r);
  esperar("con los valores de arranque, el límite es 300 UIT × S/ 5,500 = S/ 1,650,000 y no se cruzó", r.ok && inicial === "1650000.00|false", r);
  esperar("una boleta de S/ 11,800 este mes suma S/ 10,000 sin IGV; la de hace 12 meses ya no cuenta", r.ok && Number(delta) === 10000, r);
  esperar("con un límite de 1 UIT, se cruzó y el avance es ventas ÷ S/ 5,500", r.ok && cruzado === "5500.00|true|t", r);
  esperar("trae 24 meses de ventas para proyectar", r.ok && Number(meses) === 24, r);
}

// 6. Parámetros: se agregan, se corrigen con una fila nueva, se validan y quedan en la historia.
{
  const r = correr(`${ESCENA}
select count(*) as filas from retail.parametros_tributarios \\gset
select retail.guardar_parametro_tributario('uit', '2027-01-01', 5600);
select valor, provisional, registrado_por is not null, correcciones from retail.fn_parametros_tributarios_lista() where nombre = 'uit' and vigente_desde = '2027-01-01';
select retail.guardar_parametro_tributario('uit', '2027-01-01', 5650);
select valor, correcciones from retail.fn_parametros_tributarios_lista() where nombre = 'uit' and vigente_desde = '2027-01-01';
select detalle -> 'antes' ->> 'valor', detalle -> 'despues' ->> 'valor' from retail.configuracion_historial where que = 'parametro_tributario' order by id desc limit 1;
select retail.guardar_parametro_tributario('uit', '2027-01-01', 5650);
select count(*) - :filas from retail.parametros_tributarios;
select retail.guardar_parametro_tributario('uit', '2026-01-01', 5500);
select valor, provisional, correcciones from retail.fn_parametros_tributarios_lista() where nombre = 'uit' and vigente_desde = '2026-01-01';
select retail.guardar_parametro_tributario('igv', '2030-01-01', 0.19);
select retail.guardar_parametro_tributario('igv', '2030-01-01', 0.20);
select retail.fn_tasa_igv('2030-02-01'), retail.fn_tasa_igv('2029-12-31');
select retail.guardar_parametro_tributario('regimen', '2027-01-01', null, 'general');
select texto from retail.fn_parametros_tributarios_lista() where nombre = 'regimen' and vigente_desde = '2027-01-01';
select pg_temp.intento($q$select retail.guardar_parametro_tributario('igv', '2031-01-01', 18)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('uit', '2027-03-01', 5600)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('regimen', '2027-01-01', null, 'mype')$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('umbral_uit', '2027-01-01', 1650000)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('uit', '2027-01-01', 5.5)$q$);
select pg_temp.intento($q$update retail.parametros_tributarios set valor = 0.2 where nombre = 'igv'$q$);
select pg_temp.intento($q$delete from retail.parametros_tributarios where nombre = 'uit'$q$);`);
  const [nueva, corregida, historia, sinCambio, confirmada, tasas, regimen, igv18, uitMarzo, regimenMalo, umbralSoles, uitMiles, editar, borrar] = sinIds(r);
  esperar("una UIT nueva (2027) queda firmada y ya no es provisional", r.ok && nueva === "5600.0000|f|t|0", r);
  esperar("corregirla agrega una fila: la lista muestra la última y cuenta 1 corrección", r.ok && corregida === "5650.0000|1", r);
  esperar("la corrección queda en la historia de Configuración con el antes y el después", r.ok && historia === "5600.0000|5650", r);
  esperar("guardar el mismo valor ya confirmado no agrega nada (las 2 filas de 2027 y nada más)", r.ok && Number(sinCambio) === 2, r);
  esperar("repetir el valor de una UIT provisional la confirma", r.ok && confirmada === "5500.0000|f|1", r);
  esperar("la tasa de IGV desde 2030 se corrigió: rige la última; antes de 2030 sigue el 18 %", r.ok && tasas === "0.2000|0.1800", r);
  esperar("el régimen es un texto de la lista", r.ok && regimen === "general", r);
  esperar("la tasa va como fracción: 18 se rechaza", r.ok && igv18.includes("entre 0 y 100"), r);
  esperar("la UIT rige desde el 1 de enero", r.ok && uitMarzo.includes("rigen por año"), r);
  esperar("un régimen fuera de la lista se rechaza", r.ok && regimenMalo.includes("Elige un régimen"), r);
  esperar("el límite va en UIT, no en soles", r.ok && umbralSoles.includes("en UIT"), r);
  esperar("la UIT va en soles", r.ok && uitMiles.includes("en soles"), r);
  esperar("un parámetro no se edita", r.ok && editar.includes("no se edita ni se borra"), r);
  esperar("ni se borra", r.ok && borrar.includes("no se edita ni se borra"), r);
}

// 7. Permisos: solo el líder, aunque el rol tenga el módulo; nadie lee la tabla directo.
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select pg_temp.intento($q$select retail.fn_impuestos_panel()$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_registro_ventas('2024-01-01')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_registro_compras('2024-01-01')$q$);
select pg_temp.intento($q$select * from retail.fn_parametros_tributarios_lista()$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('uit', '2027-01-01', 5600)$q$);
select pg_temp.intento($q$insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'impuestos')$q$);
select pg_temp.intento($q$insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'configuracion')$q$);
${cambiaA(FELIPE)}
set local role authenticated;
select pg_temp.intento($q$select count(*) from retail.parametros_tributarios$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_ventas('2024-01-01', '2024-01-31')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_panel('2024-01-01')$q$) <> 'SIN_ERROR';`);
  const [panel, meses, rv, rc, lista, guardar, darImpuestos, darConfig, tabla, regla, liderLee] = lineas(r);
  esperar("la colaboradora no ve el panel de Impuestos", r.ok && panel.includes("Solo el líder"), r);
  esperar("ni los meses", r.ok && meses.includes("Solo el líder"), r);
  esperar("ni baja el registro de ventas", r.ok && rv.includes("Solo el líder"), r);
  esperar("ni el de compras", r.ok && rc.includes("Solo el líder"), r);
  esperar("ni ve los parámetros", r.ok && lista.includes("Solo el líder"), r);
  esperar("ni los cambia", r.ok && guardar.includes("Solo el líder"), r);
  esperar("Impuestos no se le puede dar a un rol: es «solo líder por ahora»", r.ok && darImpuestos.includes("solo del líder"), r);
  esperar("Configuración tampoco", r.ok && darConfig.includes("solo del líder"), r);
  esperar("nadie lee la tabla directo, ni el líder", r.ok && tabla.includes("permission denied"), r);
  esperar("ni la regla interna de ventas", r.ok && regla.includes("permission denied"), r);
  esperar("el líder, por la función, sí", r.ok && liderLee === "f", r);
}

// 8. Registro de ventas para el contador.
{
  const r = correr(`${ESCENA}
select count(*), count(*) filter (where anulado), sum(igv) from retail.fn_impuestos_registro_ventas('2024-01-01');
select base, igv, total, ref_tipo, ref_serie, ref_numero, to_char(ref_fecha, 'YYYY-MM-DD') from retail.fn_impuestos_registro_ventas('2024-01-01') where tipo = 'nota_credito';
select base, igv, total, left(observacion, 9) from retail.fn_impuestos_registro_ventas('2024-01-01') where anulado;
select tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, tienda from retail.fn_impuestos_registro_ventas('2024-01-01') where tipo = 'factura';
select string_agg(tipo || ':' || serie || '-' || numero, ',' order by fecha, numero) from retail.fn_impuestos_registro_ventas('2024-01-01');`);
  const [cuenta, nc, anulado, factura, orden] = lineas(r);
  esperar("enero: 6 comprobantes (1 anulado, en cero) y el IGV suma el débito, 63", r.ok && cuenta === "6|1|63.00", r);
  esperar("la nota de crédito va en negativo, con la factura que modifica", r.ok && nc === "-50.00|-9.00|-59.00|factura|F981|1|2024-01-15", r);
  esperar("el anulado va con importes en cero y dice por qué", r.ok && anulado === "0|0|0|Anulado: ", r);
  esperar("la factura lleva el RUC de la clienta y la tienda", r.ok && factura === "factura|F981|1|ruc|20600000001|Tienda Trujillo", r);
  esperar("en orden de emisión", r.ok && orden === "boleta:B981-1,boleta:B981-8,factura:F981-1,boleta:B981-2,boleta:B981-3,nota_credito:FC98-1", r);
}

// 9. Registro de compras para el contador.
{
  const r = correr(`${ESCENA}
select count(*), sum(igv) filter (where da_credito) from retail.fn_impuestos_registro_compras('2024-01-01');
select string_agg(origen || ':' || naturaleza || ':' || tipo, ',' order by origen, naturaleza, tipo) from retail.fn_impuestos_registro_compras('2024-01-01');
select base, igv, no_gravado, total, da_credito, proveedor_ruc from retail.fn_impuestos_registro_compras('2024-01-01') where tipo = 'boleta';
select no_gravado, total, tienda from retail.fn_impuestos_registro_compras('2024-01-01') where tipo = 'recibo_por_honorarios';
select serie, numero, base, igv, total, ref_tipo, ref_serie, ref_numero from retail.fn_impuestos_registro_compras('2024-01-01') where origen = 'nota_credito';
select tienda from retail.fn_impuestos_registro_compras('2024-01-01') where naturaleza = 'gasto' and tipo = 'factura';
select tienda, proveedor_ruc from retail.fn_impuestos_registro_compras('2024-01-01') where origen = 'taller';`);
  const [cuenta, filas, boleta, rh, nc, tiendaGasto, taller] = lineas(r);
  esperar("enero: 7 comprobantes (la compra anulada no); el IGV con crédito suma 297", r.ok && cuenta === "7|297.00", r);
  esperar("las tres naturalezas, el Taller y la nota de crédito", r.ok && filas === "compra:activo:factura,compra:gasto:boleta,compra:gasto:factura,compra:gasto:recibo_por_honorarios,compra:mercaderia:factura,nota_credito:mercaderia:nota_credito,taller:taller:factura", r);
  esperar("la boleta va entera como no gravada, sin crédito, con el RUC del proveedor", r.ok && boleta === "0|0.00|100.00|100.00|f|10987650982", r);
  esperar("el recibo por honorarios también, y es «de la empresa»", r.ok && rh === "1600.00|1600.00|De la empresa", r);
  esperar("la nota de crédito del proveedor va en negativo, con la factura que modifica", r.ok && nc === "FC01|7|-100.00|-18.00|-118.00|factura|F100|1", r);
  esperar("el gasto dice su tienda", r.ok && tiendaGasto === "Tienda Trujillo", r);
  esperar("el Taller, con el RUC de su proveedor", r.ok && taller === "Taller|20987650983", r);
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
