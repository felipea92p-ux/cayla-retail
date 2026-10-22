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
 *   · la pantalla en una lectura: lo que conviene revisar, el pago a cuenta y el límite de ventas (el AÑO calendario, de enero a hoy)
 *     contra el umbral en UIT;
 *   · parámetros con vigencia: se agregan, se corrigen con una fila nueva (gana la más reciente), se validan, quedan en la
 *     historia de Configuración y nunca se editan ni se borran;
 *   · permisos: el líder o quien tiene el módulo (Impuestos; los parámetros, Configuración — ADR-0253); nadie lee la tabla directo;
 *   · los registros de ventas y de compras para el contador, con sus columnas;
 *   · el saldo a favor de IGV con que CAYLA arrancó (ADR-0433, act. 4b; lo declara el contador): el IGV mensual parte de él, un saldo declarado a mitad de
 *     la cadena la reemplaza, uno anterior a los primeros datos la alarga hacia atrás, una corrección es una fila nueva, y se valida.
 *   · el límite y el aviso anticipado (`20261023161000`, ADR sin número aún) miden la MISMA cifra, el AÑO calendario: los comprobantes de enero a hoy (sin IGV, menos notas de crédito, sin
 *     anulados ni pruebas) más el ajuste opcional del año; se miden contra `aviso_umbral_uit` y `umbral_uit` × UIT. En enero la cuenta vuelve a cero sola (con el reloj puesto en enero, lo de
 *     diciembre y el ajuste del año anterior no suman), el ajuste rige por año exacto (no se hereda), no se siembra (sin fila vale 0), una corrección es una fila nueva, y se valida (en UIT,
 *     el aviso antes del límite, soles de 0 a 10 millones, desde el 1 de enero). Ninguna cifra tributaria está en el código: los umbrales de la prueba salen de los parámetros.
 *   · la composición del IGV (Ley 32387): 16 % + 2 % hasta 2025, 15,5 % + 2,5 % en 2026… siempre suman el total `igv` de ese día; el total y `fn_tasa_igv` no cambian; la nota vieja
 *     «16 % + IPM 2 %» queda en la historia (solo-agregar) y la que rige ya no la dice.
 *   · la migración se puede pegar dos veces: ni filas ni funciones cambian.
 *
 * CÓMO. Igual que `activos_y_gastos_fijos.mjs`: cada escenario en su transacción con ROLLBACK (la base local es
 * compartida), sesión simulada con `request.jwt.claim.sub`. Los meses de prueba son de 2024: no hay datos reales ahí, así
 * que el saldo a favor arranca en cero y los números son exactos.
 *
 * USO
 *   pnpm pruebas:impuestos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION_AVISO = readFileSync(join(RAIZ, "supabase", "migrations", "20261023161000_impuestos_aviso_250_uit_y_composicion_del_igv.sql"), "utf8");

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

// La escena mínima de las pruebas del aviso: solo la sesión del líder y una tienda.
const ESCENA_MIN = `
begin;
${INTENTO}
${COMP}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
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

// 5. El límite: ventas sin IGV del AÑO calendario (de enero a hoy) contra el umbral en UIT. Ya no son 12 meses móviles.
{
  const r = correr(`${ESCENA}
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric as antes \\gset
select retail.fn_impuestos_panel() -> 'umbral' ->> 'umbral_soles', retail.fn_impuestos_panel() -> 'umbral' ->> 'cruzado';
select pg_temp.comp(:'tru', 'boleta', 'B982', 1, 11800, 'aceptado', 'produccion', retail.fn_hoy_lima());
-- El 31 de diciembre del año pasado: con 12 meses móviles contaba; con el año calendario, no.
select pg_temp.comp(:'tru', 'boleta', 'B982', 2, 11800, 'aceptado', 'produccion', date_trunc('year', retail.fn_hoy_lima())::date - 1);
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric - :antes;
select retail.guardar_parametro_tributario('umbral_uit', date_trunc('year', retail.fn_hoy_lima())::date, 1);
select retail.fn_impuestos_panel() -> 'umbral' ->> 'umbral_soles', retail.fn_impuestos_panel() -> 'umbral' ->> 'cruzado',
       (retail.fn_impuestos_panel() -> 'umbral' ->> 'avance')::numeric = round(((retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric) / 5500, 4);
select jsonb_array_length(retail.fn_impuestos_panel() -> 'umbral' -> 'ventas_meses');
select (retail.fn_impuestos_panel() -> 'umbral') ? 'ventas_12m';`);
  const [inicial, delta, cruzado, meses, sigue12] = sinIds(r);
  esperar("con los valores de arranque, el límite es 300 UIT × S/ 5,500 = S/ 1,650,000 y no se cruzó", r.ok && inicial === "1650000.00|false", r);
  esperar("una boleta de S/ 11,800 de hoy suma S/ 10,000 sin IGV; la del 31 de diciembre del año pasado ya no cuenta (es el año calendario, no 12 meses)", r.ok && Number(delta) === 10000, r);
  esperar("con un límite de 1 UIT, se cruzó y el avance es ventas del año ÷ S/ 5,500", r.ok && cruzado === "5500.00|true|t", r);
  esperar("trae 24 meses de ventas para proyectar", r.ok && Number(meses) === 24, r);
  esperar("la cifra de «12 meses» ya no viaja en el panel", r.ok && sigue12 === "f", r);
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

// 7. Permisos: sin el módulo no se entra (ADR-0253: el módulo ya se da a un rol); nadie lee la tabla directo.
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select pg_temp.intento($q$select retail.fn_impuestos_panel()$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_registro_ventas('2024-01-01')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_registro_compras('2024-01-01')$q$);
select pg_temp.intento($q$select * from retail.fn_parametros_tributarios_lista()$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('uit', '2027-01-01', 5600)$q$);
select (select delegable from retail.modulos where clave = 'impuestos')::text;
select (select delegable from retail.modulos where clave = 'configuracion')::text;
${cambiaA(FELIPE)}
set local role authenticated;
select pg_temp.intento($q$select count(*) from retail.parametros_tributarios$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_ventas('2024-01-01', '2024-01-31')$q$);
select pg_temp.intento($q$select * from retail.fn_impuestos_panel('2024-01-01')$q$) <> 'SIN_ERROR';`);
  const [panel, meses, rv, rc, lista, guardar, darImpuestos, darConfig, tabla, regla, liderLee] = lineas(r);
  esperar("la colaboradora sin el módulo no ve el panel de Impuestos", r.ok && panel.includes("necesita el módulo «Impuestos»"), r);
  esperar("ni los meses", r.ok && meses.includes("necesita el módulo «Impuestos»"), r);
  esperar("ni baja el registro de ventas", r.ok && rv.includes("necesita el módulo «Impuestos»"), r);
  esperar("ni el de compras", r.ok && rc.includes("necesita el módulo «Impuestos»"), r);
  esperar("ni ve los parámetros (son de Configuración)", r.ok && lista.includes("necesita el módulo «Configuración»"), r);
  esperar("ni los cambia", r.ok && guardar.includes("necesita el módulo «Configuración»"), r);
  esperar("Impuestos ya se puede dar a un rol (ADR-0253)", r.ok && darImpuestos === "true", r);
  esperar("Configuración también", r.ok && darConfig === "true", r);
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


// 10. El saldo a favor de IGV con que CAYLA arrancó (ADR-0433, act. 4b): el contador lo declara y el IGV mensual parte de él.
{
  // Sin nada declarado la cadena es la de siempre (caso 3): 234 → 72 → se pagan 108.
  const r = correr(`${ESCENA}
select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 500) as _g \\gset
select to_char(mes, 'YYYY-MM') || '|' || saldo_anterior || '|' || a_pagar || '|' || saldo_a_favor from retail.fn_impuestos_igv_meses('2024-01-01', '2024-04-30') order by mes;`);
  const [ene, feb, mar, abr] = lineas(r);
  esperar("saldo declarado de 500 al arrancar enero: enero parte de 500 y deja S/ 734 a favor (63 − 297 − 500)", r.ok && ene === "2024-01|500.00|0|734.00", r);
  esperar("febrero arrastra 734 y deja 572 (180 − 18 − 734)", r.ok && feb === "2024-02|734.00|0|572.00", r);
  esperar("marzo arrastra 572 y deja 392 a favor: ya no se paga nada", r.ok && mar === "2024-03|572.00|0|392.00", r);
  esperar("abril sin movimiento conserva los 392", r.ok && abr === "2024-04|392.00|0|392.00", r);
}
{
  // Un saldo declarado a mitad de la cadena REEMPLAZA lo que venía arrastrando (lo oficial manda sobre lo calculado con datos incompletos).
  const r = correr(`${ESCENA}
select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-02-01', 100) as _g \\gset
select to_char(mes, 'YYYY-MM') || '|' || saldo_anterior || '|' || a_pagar || '|' || saldo_a_favor from retail.fn_impuestos_igv_meses('2024-01-01', '2024-03-31') order by mes;`);
  const [ene, feb, mar] = lineas(r);
  esperar("declarado en febrero: enero queda como era (234 a favor)", r.ok && ene === "2024-01|0|0|234.00", r);
  esperar("febrero parte de los 100 declarados, no de los 234 calculados: se pagan 62", r.ok && feb === "2024-02|100.00|62.00|0", r);
  esperar("y marzo ya no trae saldo: se pagan 180", r.ok && mar === "2024-03|0|180.00|0", r);
}
{
  // Declarado ANTES del primer mes con datos: la cadena se alarga hacia atrás y lo arrastra.
  const r = correr(`${ESCENA}
select retail.guardar_parametro_tributario('saldo_favor_igv', '2023-12-01', 1000) as _g \\gset
select to_char(mes, 'YYYY-MM') || '|' || saldo_anterior || '|' || a_pagar || '|' || saldo_a_favor from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31');
select to_char(mes, 'YYYY-MM') || '|' || saldo_anterior || '|' || a_pagar || '|' || saldo_a_favor from retail.fn_impuestos_igv_meses('2023-12-01', '2023-12-31');`);
  const [soloEne, soloDic] = lineas(r);
  esperar("declarado en diciembre de 2023, antes de los datos: pedir solo enero parte de los 1000 (1000 + 63 − 297 → 1234 a favor)", r.ok && soloEne === "2024-01|1000.00|0|1234.00", r);
  esperar("y pedir diciembre lo muestra: 1000 de entrada y 1000 a favor", r.ok && soloDic === "2023-12|1000.00|0|1000.00", r);
}
{
  // Una corrección es una fila nueva: gana la más reciente, y la historia de Configuración guarda las dos.
  const r = correr(`${ESCENA}
select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 500) as _g1 \\gset
select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 700) as _g2 \\gset
select to_char(mes, 'YYYY-MM') || '|' || saldo_anterior || '|' || saldo_a_favor from retail.fn_impuestos_igv_meses('2024-01-01', '2024-01-31');
select count(*) from retail.parametros_tributarios where nombre = 'saldo_favor_igv';
select count(*) from retail.configuracion_historial where que = 'parametro_tributario' and detalle ->> 'nombre' = 'saldo_favor_igv';`);
  const [ene, filas, historia] = lineas(r);
  esperar("corregido de 500 a 700 el mismo mes: gana el último (enero parte de 700 y deja 934)", r.ok && ene === "2024-01|700.00|934.00", r);
  esperar("las dos filas quedan en la tabla, y en la historia de Configuración", r.ok && filas === "2" && historia === "2", r);
}
{
  const r = correr(`${ESCENA}
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-15', 500)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', -1)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 10000001)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 0)$q$);
select count(*) from retail.parametros_tributarios where nombre = 'saldo_favor_igv';
${cambiaA(MICAELA)}
select pg_temp.intento($q$select retail.guardar_parametro_tributario('saldo_favor_igv', '2024-01-01', 500)$q$);`);
  const [dia, negativo, enorme, nulo, cero, filas, sinModulo] = lineas(r);
  esperar("solo rige desde el día 1 de un mes", r.ok && /día 1 de un mes/.test(dia ?? ""), r);
  esperar("no puede ser negativo, ni de más de S/ 10 millones, ni faltar", r.ok && [negativo, enorme, nulo].every((m) => /de 0 a 10/.test(m ?? "")), r);
  esperar("cero se acepta (declarar que no hay saldo es un dato) y es la única fila que quedó", r.ok && cero === "SIN_ERROR" && filas === "1", r);
  esperar("una colaboradora sin el módulo Configuración no lo guarda", r.ok && /necesita el módulo «Configuración»/.test(sinModulo ?? ""), r);
}

// 11. La composición del IGV (Ley 32387): los componentes suman el total de cada día; el total no se tocó.
{
  const r = correr(`${ESCENA_MIN}
select count(*) from (select distinct vigente_desde as d from retail.parametros_tributarios where nombre in ('igv_general', 'igv_ipm')) f
 where (select valor from retail.fn_parametro_tributario('igv_general', f.d)) + (select valor from retail.fn_parametro_tributario('igv_ipm', f.d)) is distinct from retail.fn_tasa_igv(f.d);
select retail.fn_tasa_igv(date '2025-12-31') || '|' || (select valor from retail.fn_parametro_tributario('igv_general', date '2025-12-31')) || '|' || (select valor from retail.fn_parametro_tributario('igv_ipm', date '2025-12-31'));
select retail.fn_tasa_igv(date '2026-01-01') || '|' || (select valor from retail.fn_parametro_tributario('igv_general', date '2026-01-01')) || '|' || (select valor from retail.fn_parametro_tributario('igv_ipm', date '2026-01-01'));
select (select valor from retail.fn_parametro_tributario('igv_general', date '2027-06-01')) || '|' || (select valor from retail.fn_parametro_tributario('igv_ipm', date '2027-06-01'));
select (select valor from retail.fn_parametro_tributario('igv_general', date '2035-01-01')) || '|' || (select valor from retail.fn_parametro_tributario('igv_ipm', date '2035-01-01'));
select count(*) from retail.fn_parametro_tributario('igv_general', date '2011-02-28');
select retail.fn_tasa_igv(date '2011-03-01') || '|' || retail.fn_tasa_igv(date '2026-10-22') || '|' || retail.fn_tasa_igv(date '2031-01-01');
select count(*) from retail.parametros_tributarios where nombre = 'igv' and nota like '%16 %';
select count(*) from (select distinct on (vigente_desde) nota from retail.parametros_tributarios where nombre = 'igv' order by vigente_desde, created_at desc, id desc) v where nota like '%16 %';
select correcciones || '|' || valor from retail.fn_parametros_tributarios_lista() where nombre = 'igv' and vigente_desde = '2011-03-01';`);
  const [descuadres, hasta2025, en2026, en2027, en2035, antes2011, totales, notasViejas, notasVigentes, lista] = lineas(r);
  esperar("en todas las fechas con componentes, IGV + IPM = el total `igv` de ese día (ningún descuadre)", r.ok && Number(descuadres) === 0, r);
  esperar("hasta el 31 dic 2025: 18 % = 16 % + 2 %", r.ok && hasta2025 === "0.1800|0.1600|0.0200", r);
  esperar("desde el 1 ene 2026 (Ley 32387): 18 % = 15,5 % + 2,5 %", r.ok && en2026 === "0.1800|0.1550|0.0250", r);
  esperar("el IPM sube y el IGV baja según la ley: en 2027, 15 % + 3 %", r.ok && en2027 === "0.1500|0.0300", r);
  esperar("después de 2029 siguen los valores de 2029 (14 % + 4 %) hasta que se cargue otro", r.ok && en2035 === "0.1400|0.0400", r);
  esperar("antes de marzo de 2011 no hay componentes (ni total): no se inventa", r.ok && Number(antes2011) === 0, r);
  esperar("el total sigue en 18 % antes, durante y después: `fn_tasa_igv` no cambió", r.ok && totales === "0.1800|0.1800|0.1800", r);
  esperar("la nota vieja «16 % + IPM 2 %» sigue en la tabla (solo-agregar: nada se edita)…", r.ok && Number(notasViejas) === 1, r);
  esperar("…pero la que rige ya no la dice, y la lista cuenta 1 corrección con el mismo 18 %", r.ok && Number(notasVigentes) === 0 && lista === "1|0.1800", r);
}

// 12. Las reglas de la tabla para los nombres nuevos (directo, sin pasar por la función).
{
  const r = correr(`${ESCENA_MIN}
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('igv_general', '2031-05-17', 0.15)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('igv_ipm', '2031-05-17', 0.03)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('igv_general', '2031-05-18', 1.5)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto) values ('igv_ipm', '2031-05-18', 0.02, 'x')$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('aviso_umbral_uit', '2031-03-01', 250)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('aviso_umbral_uit', '2031-01-01', 0)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('ventas_previas_erp', '2031-03-01', 100)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('ventas_previas_erp', '2031-01-01', -1)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('ventas_previas_erp', '2031-01-01', 10000001)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('ventas_previas_erp', '2031-01-01', 0)$q$);
select pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('no_existe', '2031-01-01', 1)$q$);
select valor || '|' || provisional from retail.parametros_tributarios where nombre = 'aviso_umbral_uit' and vigente_desde = '2026-01-01';
select count(*) from retail.parametros_tributarios where nombre = 'ventas_previas_erp' and vigente_desde = '2026-01-01';`);
  const [ok1, ok2, finito, conTexto, mesAviso, avisoCero, mesPrevias, previasNeg, previasEnorme, previasCero, desconocido, avisoSemilla, ajusteSembrado] = lineas(r);
  esperar("los componentes del IGV rigen desde cualquier fecha (como el total)", r.ok && ok1 === "SIN_ERROR" && ok2 === "SIN_ERROR", r);
  esperar("un componente va entre 0 y 100 % y sin texto", r.ok && finito.includes("valor_coherente") && conTexto.includes("valor_coherente"), r);
  esperar("el aviso rige desde el 1 de enero y va en UIT mayores que cero", r.ok && mesAviso.includes("parametros_tributarios_anual") && avisoCero.includes("valor_coherente"), r);
  esperar("el ajuste de ventas del año rige desde el 1 de enero, no es negativo, no pasa de 10 millones y el cero vale", r.ok && mesPrevias.includes("parametros_tributarios_anual") && previasNeg.includes("valor_coherente") && previasEnorme.includes("valor_coherente") && previasCero === "SIN_ERROR", r);
  esperar("un nombre desconocido sigue rechazado", r.ok && desconocido.includes("parametros_tributarios_nombre_check"), r);
  esperar("el aviso de arranque es 250 UIT y es decisión de Felipe (no queda «por confirmar»)", r.ok && avisoSemilla === "250.0000|false", r);
  esperar("el ajuste opcional NO se siembra: sin fila vale 0 y nada lo exige", r.ok && Number(ajusteSembrado) === 0, r);
}

// 13. Guardar los dos parámetros nuevos: se valida y solo lo hace quien tiene el módulo Configuración.
{
  const anio = `date_trunc('year', retail.fn_hoy_lima())::date`;
  const r = correr(`${ESCENA_MIN}
select pg_temp.intento($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', ${anio}, 1375000)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', ${anio}, 0)$q$);
select (select valor from retail.fn_parametro_tributario('umbral_uit', ${anio})) as limite \\gset
select pg_temp.intento(format($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', %L, %s)$q$, ${anio}, :limite));
select pg_temp.intento(format($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', %L, %s)$q$, ${anio}, :limite + 1));
select pg_temp.intento(format($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', %L, %s)$q$, ${anio}, :limite - 1));
select pg_temp.intento($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', '2020-01-01', 5000)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', '2027-03-01', 100)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('ventas_previas_erp', date_trunc('year', retail.fn_hoy_lima())::date, -1)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('ventas_previas_erp', date_trunc('year', retail.fn_hoy_lima())::date, 10000001)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('ventas_previas_erp', date_trunc('year', retail.fn_hoy_lima())::date, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('ventas_previas_erp', (date_trunc('year', retail.fn_hoy_lima()) + interval '2 months')::date, 100)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('igv_general', '2030-01-01', 0.15)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('igv_ipm', '2030-01-01', 0.03)$q$);
select count(*) as filas from retail.parametros_tributarios where nombre = 'ventas_previas_erp' \\gset
select count(*) as hist from retail.configuracion_historial where que = 'parametro_tributario' and detalle ->> 'nombre' = 'ventas_previas_erp' \\gset
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 120000.5) as _a \\gset
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 150000) as _b \\gset
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 150000) as _c \\gset
select count(*) - :filas from retail.parametros_tributarios where nombre = 'ventas_previas_erp';
select valor || '|' || provisional || '|' || correcciones from retail.fn_parametros_tributarios_lista() where nombre = 'ventas_previas_erp' and vigente_desde = ${anio};
select count(*) - :hist from retail.configuracion_historial where que = 'parametro_tributario' and detalle ->> 'nombre' = 'ventas_previas_erp';
${cambiaA(MICAELA)}
select pg_temp.intento($q$select retail.guardar_parametro_tributario('ventas_previas_erp', date_trunc('year', retail.fn_hoy_lima())::date, 100)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('aviso_umbral_uit', date_trunc('year', retail.fn_hoy_lima())::date, 100)$q$);`);
  const [enSoles, cero, igual, mas, menos, anioSinLimite, soloEnero, previasNeg, previasEnorme, previasNulo, previasMarzo, general, ipm, filasNuevas, lista, historia, micaela1, micaela2] = sinIds(r);
  esperar("el aviso va en UIT: en soles (1375000) se rechaza", r.ok && /en UIT/.test(enSoles ?? ""), r);
  esperar("el aviso no puede ser cero", r.ok && /en UIT/.test(cero ?? ""), r);
  esperar("el aviso tiene que ir ANTES del límite: igual al límite o más, se rechaza (si no, nunca avisaría)", r.ok && /antes del límite/.test(igual ?? "") && /antes del límite/.test(mas ?? ""), r);
  esperar("un aviso por debajo del límite se acepta", r.ok && menos === "SIN_ERROR", r);
  esperar("en un año sin límite cargado, el aviso se acepta (no hay contra qué compararlo)", r.ok && anioSinLimite === "SIN_ERROR", r);
  esperar("el aviso rige desde el 1 de enero", r.ok && /rigen por año/.test(soloEnero ?? ""), r);
  esperar("el ajuste de ventas del año: ni negativo, ni de más de 10 millones, ni vacío", r.ok && [previasNeg, previasEnorme, previasNulo].every((m) => /de 0 a 10 millones/.test(m ?? "")), r);
  esperar("y también desde el 1 de enero", r.ok && /rigen por año/.test(previasMarzo ?? ""), r);
  esperar("los componentes del IGV no se editan desde la función: no son parámetros que se guarden desde Configuración", r.ok && /no existe/.test(general ?? "") && /no existe/.test(ipm ?? ""), r);
  esperar("120000.5 y luego 150000: dos filas nuevas; repetir 150000 no agrega nada", r.ok && Number(filasNuevas) === 2, r);
  esperar("la lista muestra la última (150000, ya no provisional) y cuenta las correcciones", r.ok && /^150000\.0000\|false\|\d+$/.test(lista ?? "") && Number(lista.split("|")[2]) >= 1, r);
  esperar("las dos quedan en la historia de Configuración", r.ok && Number(historia) === 2, r);
  esperar("una colaboradora sin el módulo Configuración no guarda ninguno de los dos", r.ok && /necesita el módulo «Configuración»/.test(micaela1 ?? "") && /necesita el módulo «Configuración»/.test(micaela2 ?? ""), r);
}

// 14. El panel: las ventas del AÑO, la misma cifra para la tarjeta del límite y para el aviso. Los umbrales de la prueba salen de los parámetros (UIT y límite que rigen), no de cifras escritas aquí.
{
  const anio = `date_trunc('year', retail.fn_hoy_lima())::date`;
  const r = correr(`${ESCENA_MIN}
select (retail.fn_impuestos_panel() -> 'parametros' -> 'uit' ->> 'valor')::numeric as uit \\gset
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric as antes \\gset
select u ->> 'aviso_soles', u ->> 'ajuste', u ->> 'aviso_alcanzado', u ->> 'cruzado',
       (u ->> 'anio')::int = extract(year from retail.fn_hoy_lima())::int, (u ->> 'ventas_anio')::numeric = (u ->> 'ventas_anio_erp')::numeric
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;
select retail.fn_impuestos_panel() -> 'parametros' -> 'aviso_umbral_uit' ->> 'valor', (retail.fn_impuestos_panel() -> 'parametros') ? 'ventas_previas';
-- Comprobantes de este año: una boleta (base 10 000), otra anulada y otra de pruebas (no cuentan) y una nota de crédito (resta 1 000); y una boleta del 31 de dic del año pasado (no es de este año).
select pg_temp.comp(:'tru', 'boleta', 'B983', 1, 11800, 'aceptado', 'produccion', retail.fn_hoy_lima()) as b1 \\gset
select pg_temp.comp(:'tru', 'boleta', 'B983', 2, 5900, 'anulado', 'produccion', retail.fn_hoy_lima()) as b2 \\gset
select pg_temp.comp(:'tru', 'boleta', 'B983', 3, 5900, 'aceptado', 'sandbox', retail.fn_hoy_lima()) as b3 \\gset
select pg_temp.comp(:'tru', 'nota_credito', 'FC93', 1, 1180, 'aceptado', 'produccion', retail.fn_hoy_lima(), :'b1') as nc \\gset
select pg_temp.comp(:'tru', 'boleta', 'B983', 4, 11800, 'aceptado', 'produccion', (${anio} - 1)) as b4 \\gset
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio_erp')::numeric - :antes;
-- El ajuste de este año NO existe (no se siembra), pero sí el del año pasado y el del que viene: si el panel los heredara, el del año pasado (777 777) aparecería aquí.
select retail.guardar_parametro_tributario('ventas_previas_erp', (${anio} - interval '1 year')::date, 777777) as _p0 \\gset
select retail.guardar_parametro_tributario('ventas_previas_erp', (${anio} + interval '1 year')::date, 888888) as _p1 \\gset
select retail.fn_impuestos_panel() -> 'umbral' ->> 'ajuste', (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric = (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio_erp')::numeric;
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 300000) as _p2 \\gset
select u ->> 'ajuste', (u ->> 'ventas_anio')::numeric - (u ->> 'ventas_anio_erp')::numeric
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio')::numeric as t \\gset
-- El límite y el aviso se ponen RELATIVOS a lo que lleva el año: límite = t + 4 000, aviso = t − 1 000 (en UIT de la UIT que rige).
select retail.guardar_parametro_tributario('umbral_uit', ${anio}, round((:t + 4000) / :uit, 4)) as _l \\gset
select retail.guardar_parametro_tributario('aviso_umbral_uit', ${anio}, round((:t - 1000) / :uit, 4)) as _a \\gset
select u ->> 'aviso_alcanzado', u ->> 'cruzado', abs((u ->> 'aviso_soles')::numeric - (:t - 1000)) < 1, abs((u ->> 'umbral_soles')::numeric - (:t + 4000)) < 1,
       (u ->> 'avance')::numeric = round((u ->> 'ventas_anio')::numeric / (u ->> 'umbral_soles')::numeric, 4)
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 305000) as _p3 \\gset
select u ->> 'aviso_alcanzado', u ->> 'cruzado', (u ->> 'avance')::numeric >= 1
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;
select retail.guardar_parametro_tributario('ventas_previas_erp', ${anio}, 0) as _p4 \\gset
select u ->> 'aviso_alcanzado', u ->> 'cruzado', u ->> 'ajuste'
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;`);
  const [defecto, avisoUit, delta, sinHeredar, conAjuste, ya, cruzaAviso, vuelve] = sinIds(r);
  const aviso = (defecto ?? "").split("|");
  esperar("por defecto: el aviso son 250 UIT × S/ 5,500 = S/ 1,375,000; sin ajuste (0), sin avisar ni haber cruzado el límite", r.ok && aviso[0] === "1375000.00" && Number(aviso[1]) === 0 && aviso[2] === "false" && aviso[3] === "false", r);
  esperar("el panel dice en qué año mide y, sin ajuste, las ventas del año son las del sistema", r.ok && aviso[4] === "t" && aviso[5] === "t", r);
  esperar("el parámetro del aviso viaja en el panel (250 UIT) y el ajuste ya no viaja entre los parámetros", r.ok && avisoUit === "250.0000|f", r);
  esperar("las ventas del año suman la boleta (10 000) menos la nota de crédito (1 000); no cuentan la anulada, la de pruebas ni la del año pasado → 9 000", r.ok && Number(delta) === 9000, r);
  esperar("el ajuste rige por año EXACTO: lo cargado para el año pasado y el que viene no entra a este año", r.ok && sinHeredar === "0|t", r);
  esperar("cargado el de este año (300 000): suma a las ventas del año", r.ok && Number(conAjuste?.split("|")[0]) === 300000 && Number(conAjuste?.split("|")[1]) === 300000, r);
  esperar("con el aviso en (ventas − 1 000) y el límite en (ventas + 4 000): el aviso se enciende, el límite no, y el avance de la tarjeta es ventas del año ÷ límite", r.ok && ya === "true|false|t|t|t", r);
  esperar("sumando 5 000 más de ajuste: pasó el límite → el aviso se apaga y se marca el límite cruzado (la tarjeta y el aviso leen la misma cifra)", r.ok && cruzaAviso === "false|true|t", r);
  esperar("quitando el ajuste (0), vuelve a estar lejos del aviso", r.ok && vuelve === "false|false|0.0000", r);
}

// 14b. En enero la cuenta vuelve a cero sola. Se pone el reloj de la base en el 31 de diciembre y luego en el 15 de enero (la función del reloj se reemplaza dentro de la transacción, que siempre se deshace).
{
  const reloj = (d) => `create or replace function retail.fn_hoy_lima() returns date language sql stable as $$ select date '${d}' $$;\n`;
  const r = correr(`${ESCENA_MIN}
${reloj("2026-12-31")}
select pg_temp.comp(:'tru', 'boleta', 'B984', 1, 11800, 'aceptado', 'produccion', '2026-12-20') as d1 \\gset
select pg_temp.comp(:'tru', 'boleta', 'B984', 2, 5900, 'aceptado', 'produccion', '2027-01-10') as e1 \\gset
select retail.guardar_parametro_tributario('ventas_previas_erp', '2026-01-01', 777777) as _p \\gset
select u ->> 'anio', (u ->> 'ventas_anio_erp')::numeric, u ->> 'ajuste'
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;
${reloj("2027-01-15")}
select u ->> 'anio', (u ->> 'ventas_anio_erp')::numeric, u ->> 'ajuste', (u ->> 'ventas_anio')::numeric, u ->> 'cruzado',
       (u ->> 'avance')::numeric = round((u ->> 'ventas_anio')::numeric / (u ->> 'umbral_soles')::numeric, 4)
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;`);
  const [diciembre, enero] = sinIds(r);
  const [anioDic, erpDic] = (diciembre ?? "").split("|");
  esperar("el 31 de diciembre el año todavía suma lo de diciembre (10 000 del 20 de diciembre; el ajuste de 2026, 777 777, también)", r.ok && anioDic === "2026" && Number(erpDic) >= 10000 && diciembre.endsWith("|777777.0000"), r);
  esperar("el 15 de enero el año es 2027: solo cuenta lo de 2027 (5 000), el ajuste de 2026 no se hereda y la tarjeta vuelve a medir desde cero", r.ok && /^2027\|5000\.00\|0\|5000\.00\|false\|t$/.test(enero ?? ""), r);
}

// 14c. A mitad de año el año suma TODOS los meses desde enero, no solo el mes en curso: con el reloj en el 15 de junio, una boleta de enero y otra de junio cuentan; una de diciembre pasado, no.
{
  const reloj = (d) => `create or replace function retail.fn_hoy_lima() returns date language sql stable as $$ select date '${d}' $$;\n`;
  const r = correr(`${ESCENA_MIN}
${reloj("2026-06-15")}
select (retail.fn_impuestos_panel() -> 'umbral' ->> 'ventas_anio_erp')::numeric as antes \\gset
select pg_temp.comp(:'tru', 'boleta', 'B985', 1, 11800, 'aceptado', 'produccion', '2026-01-10') as m1 \\gset
select pg_temp.comp(:'tru', 'boleta', 'B985', 2, 5900, 'aceptado', 'produccion', '2026-06-05') as m2 \\gset
select pg_temp.comp(:'tru', 'boleta', 'B985', 3, 11800, 'aceptado', 'produccion', '2025-12-20') as m3 \\gset
select u ->> 'anio', (u ->> 'ventas_anio_erp')::numeric - :antes, (u ->> 'ventas_anio')::numeric - :antes
  from (select retail.fn_impuestos_panel() -> 'umbral' as u) x;`);
  const [medio] = sinIds(r);
  esperar("en junio el año suma enero y junio (10 000 + 5 000) y no suma diciembre del año pasado", r.ok && medio === "2026|15000.00|15000.00", r);
}

// 15. La migración se puede pegar dos veces: ni filas ni funciones cambian.
{
  const huella = `select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p where p.pronamespace = 'retail'::regnamespace
                   and p.proname in ('fn_impuestos_panel', 'guardar_parametro_tributario', 'fn_parametros_tributarios_lista', 'fn_tasa_igv', 'fn_parametro_tributario')`;
  const r = correr(`begin;
select (${huella}) as h1 \\gset
select count(*) as filas from retail.parametros_tributarios \\gset
${MIGRACION_AVISO}
select 'migracion: pegarla otra vez deja las funciones igual', ((${huella}) = :'h1')::text;
select 'migracion: y no agrega ninguna fila', ((select count(*) from retail.parametros_tributarios) = :filas)::text;
select 'migracion: el aviso del panel está una sola vez', ((select (length(d) - length(replace(d, 'v_total_anio := v_12m + coalesce(v_previas_valor, 0)', ''))) / length('v_total_anio := v_12m + coalesce(v_previas_valor, 0)') from (select pg_get_functiondef('retail.fn_impuestos_panel(date)'::regprocedure) d) x) = 1)::text;
select 'migracion: y las validaciones del guardado, una sola vez', ((select (length(d) - length(replace(d, 'El aviso va en UIT (250), no en soles.', ''))) / length('El aviso va en UIT (250), no en soles.') from (select pg_get_functiondef('retail.guardar_parametro_tributario(text,date,numeric,text)'::regprocedure) d) x) = 1)::text;`);
  const filas = Object.fromEntries(lineas(r).filter((l) => l.includes("|")).map((l) => l.split("|")));
  esperar("migración: pegarla otra vez deja las funciones igual", r.ok && filas["migracion: pegarla otra vez deja las funciones igual"] === "true", r);
  esperar("migración: y no agrega ninguna fila", r.ok && filas["migracion: y no agrega ninguna fila"] === "true", r);
  esperar("migración: el aviso del panel está una sola vez", r.ok && filas["migracion: el aviso del panel está una sola vez"] === "true", r);
  esperar("migración: y las validaciones del guardado, una sola vez", r.ok && filas["migracion: y las validaciones del guardado, una sola vez"] === "true", r);
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
