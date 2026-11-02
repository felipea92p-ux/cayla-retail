#!/usr/bin/env node
/**
 * Prueba de ADR-0598, actividad 1 — el sustento del costo (`20261102055000_sustento_del_costo.sql`).
 *
 * QUÉ CUBRE
 *   · `fn_sustento_costos` suma lo gastado SIN IGV por (origen, proveedor, papel), con cuántos documentos:
 *     compras de mercadería (factura, nota de venta, sin comprobante) con su nota de crédito restando; gastos con factura, boleta y
 *     recibo por honorarios; un gasto sin compra (sin proveedor, «sin_comprobante»); el Taller (factura y sin comprobante); y un lote
 *     recibido sin comprobante, al costo con que entró.
 *   · NO cuentan: el activo (se deprecia), la compra anulada, lo que cae fuera del rango, el lote que entró sin costo y el lote que
 *     llegó en un envío (su plata vive en las compras de la orden).
 *   · solo el líder: una colaboradora recibe 42501; un rango al revés, 22023.
 *   · la migración se puede pegar dos veces.
 *   · actividad 3 (`20261102060000_renta_del_ano_parametros.sql`): la escala del Régimen MYPE y el tope de las boletas vienen sembrados desde 2017 y se
 *     heredan; «lo de antes del sistema» se guarda por año (la utilidad puede ser una pérdida; los otros tres, de 0 en adelante), desde el 1 de enero;
 *     la escala no se cambia desde la pantalla; y las dos partes se pegan dos veces.
 *
 * CÓMO. Como `impuestos.mjs`: todo en una transacción con ROLLBACK (la base local es compartida), sesión simulada con
 * `request.jwt.claim.sub`, y meses de 2024, donde no hay datos reales.
 *
 * USO
 *   pnpm pruebas:sustento-costos    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261102055000_sustento_del_costo.sql"), "utf8");
const MIGRACION_PARAMETROS = readFileSync(join(RAIZ, "supabase", "migrations", "20261102060000_renta_del_ano_parametros.sql"), "utf8");

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
const lineas = (r) => (r.ok ? r.salida.split("\n").filter(Boolean) : []);
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallas = 0;
function esperar(nombre, condicion, r) {
  if (condicion) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallas += 1;
    console.log(`  ✗ ${nombre}`);
    if (r && !r.ok) console.log(`      ${r.mensaje.split("\n").slice(0, 4).join("\n      ")}`);
    else if (r) console.log(`      salida: ${JSON.stringify(r.salida)}`);
  }
}

/** Enero de 2024, una fuente por caso. Los montos son sin IGV; entre paréntesis lo que la función debe devolver.
 *  Mercadería — Textiles: factura 1,000 con nota de crédito de 100 (900, 1 documento), nota de venta 300; Bodega: compra sin
 *               comprobante 200; Lotes: un lote sin comprobante de 10 a S/ 12 (120) y otro sin costo (no suma).
 *  Gastos     — Textiles: alquiler con factura 236 (200); Bodega: bolsas con boleta 100 y contador con recibo 1,600; y una luz
 *               sin comprobante de 50, sin proveedor.
 *  Taller     — Hilos: factura 50 y sin comprobante 80.
 *  No cuentan — un activo con factura de 590, una compra anulada de 500 y una factura de diciembre de 2023 de 700. */
const ESCENA = `
begin;
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.proveedores (nombre, ruc, activo) values ('Textiles Prueba S1', '20987651001', true) returning id as prov \\gset
insert into retail.proveedores (nombre, ruc, activo) values ('Bodega Prueba S1', '10987651002', true) returning id as prov2 \\gset
insert into retail.proveedores (nombre, ruc, activo) values ('Lotes Prueba S1', '10987651003', true) returning id as prov3 \\gset
insert into retail.proveedores_produccion (nombre, rubro, ruc) values ('Hilos Prueba S1', 'avios', '20987651004') returning id as provt \\gset

insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'factura', 'F100', '1', '2024-01-05', 'contado', 1000, 180, 1180, :'tru') returning id as merca \\gset
insert into retail.compra_notas_credito (compra_id, serie_numero, fecha, subtotal, igv, monto, motivo, aplicado)
values (:'merca', 'FC01-7', '2024-01-25', 100, 18, 118, 'devolucion', 118);
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'nota_venta', 'NV1', '1', '2024-01-06', 'contado', 300, 0, 300, :'tru');
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov2', 'sin_comprobante', 'SC', 'SC-900001', '2024-01-07', 'contado', 200, 0, 200, :'tru');
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id, estado, motivo_anulacion)
values (:'prov', 'factura', 'F100', '2', '2024-01-16', 'contado', 500, 90, 590, :'tru', 'anulada', 'se registró dos veces');
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total, ubicacion_gestion_id)
values (:'prov', 'factura', 'F100', '3', '2023-12-20', 'contado', 700, 126, 826, :'tru');

select retail.registrar_gasto(:'tru', 'alquileres', 'Alquiler de enero', '2024-01-08', 236, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F200','numero','1','condicion','credito','fecha_vencimiento','2024-02-08')) as gf \\gset
select retail.registrar_gasto(:'tru', 'suministros', 'Bolsas', '2024-01-09', 100, jsonb_build_object('tipo','boleta','proveedor_id',:'prov2','serie','B300','numero','1','condicion','credito','fecha_vencimiento','2024-02-09')) as gb \\gset
select retail.registrar_gasto(null, 'asesoria', 'Contador de enero', '2024-01-18', 1600, jsonb_build_object('tipo','recibo_por_honorarios','proveedor_id',:'prov2','serie','E001','numero','9','condicion','credito','fecha_vencimiento','2024-02-18')) as rh \\gset
select retail.registrar_gasto(:'tru', 'servicios_basicos', 'Luz de enero', '2024-01-12', 50, null, 'yape') as luz \\gset
select retail.registrar_activo(:'tru', 'muebles', 'Mostrador', '2024-01-12', 590, jsonb_build_object('tipo','factura','proveedor_id',:'prov','serie','F400','numero','1','condicion','credito','fecha_vencimiento','2024-02-12')) as act \\gset

insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total)
values (:'provt', 'factura', 'F500', '1', '2024-01-14', 'contado', 50, 9, 59),
       (:'provt', 'sin_comprobante', 'SC', 'SC-900002', '2024-01-15', 'contado', 80, 0, 80);

select retail.recibir_lote(:'tru', :'prov3', jsonb_build_array(jsonb_build_object('variante_id', '${VARIANTE}', 'cantidad', 10, 'costo_unitario', 12)), null, null) as lote1 \\gset
select retail.recibir_lote(:'tru', :'prov3', jsonb_build_array(jsonb_build_object('variante_id', '${VARIANTE}', 'cantidad', 4)), null, null) as lote2 \\gset
select retail.recibir_lote(:'tru', :'prov3', jsonb_build_array(jsonb_build_object('variante_id', '${VARIANTE}', 'cantidad', 5, 'costo_unitario', 12)), null, null) as lote3 \\gset
update retail.lotes set fecha_recepcion = '2024-01-20 10:00-05' where id in (:'lote1', :'lote2', :'lote3');
-- El tercero llegó en un envío de una orden de compra: su plata vive en las compras de la orden.
insert into retail.despachos (ubicacion_destino_id, despachado_por) values (:'tru', retail.fn_actor_persona_id(false)) returning id as desp \\gset
update retail.lotes set despacho_id = :'desp' where id = :'lote3';
`;

const LEER = `select origen, coalesce(proveedor, '—'), papel, documentos, monto from retail.fn_sustento_costos('2024-01-01', '2024-01-31')
 where proveedor is null or proveedor like '%Prueba S1' order by origen, 2, papel;`;

console.log("Sustento del costo (ADR-0598, actividad 1)");

{
  const r = correr(`${ESCENA}${LEER}`);
  const filas = lineas(r);
  const esperadas = [
    "gasto|Bodega Prueba S1|boleta|1|100.00",
    "gasto|Bodega Prueba S1|recibo_por_honorarios|1|1600.00",
    "gasto|Textiles Prueba S1|factura|1|200.00",
    "gasto|—|sin_comprobante|1|50.00",
    "mercaderia|Bodega Prueba S1|sin_comprobante|1|200.00",
    "mercaderia|Lotes Prueba S1|sin_comprobante|1|120.00",
    "mercaderia|Textiles Prueba S1|factura|1|900.00",
    "mercaderia|Textiles Prueba S1|nota_venta|1|300.00",
    "taller|Hilos Prueba S1|factura|1|50.00",
    "taller|Hilos Prueba S1|sin_comprobante|1|80.00",
  ];
  esperar("cada fuente con su papel y su monto sin IGV (la nota de crédito resta)", r.ok && JSON.stringify(filas) === JSON.stringify(esperadas), r);
  esperar("no cuentan el activo, la compra anulada, diciembre de 2023, el lote sin costo ni el lote de un envío", r.ok && !filas.some((f) => /\|(590|500|700|826|60|180)\.00$/.test(f)), r);
}

{
  const r = correr(`${ESCENA}select count(*) from retail.fn_sustento_costos('2023-12-01', '2023-12-31') where proveedor like '%Prueba S1';`);
  esperar("el rango manda: en diciembre de 2023 solo está la factura de ese mes", r.ok && r.salida === "1", r);
}

{
  const r = correr(`begin;\n${cambiaA(MICAELA)}select retail.fn_sustento_costos('2024-01-01', '2024-01-31');`);
  esperar("una colaboradora no lo ve (42501)", !r.ok && /Solo el líder ve el sustento/.test(r.mensaje), r);
}

{
  const r = correr(`begin;\n${cambiaA(FELIPE)}select retail.fn_sustento_costos('2024-02-01', '2024-01-01');`);
  esperar("un rango al revés se rechaza", !r.ok && /rango de fechas no es válido/.test(r.mensaje), r);
}

{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}\nselect count(*) from pg_proc where proname = 'fn_sustento_costos';`);
  esperar("la migración se pega dos veces y deja una sola función", r.ok && r.salida.split("\n").pop() === "1", r);
}

{
  const r = correr(`begin;\n${cambiaA(FELIPE)}
select 'resto', valor from retail.fn_parametro_tributario('renta_tasa_resto', '2026-11-02')
union all select 'tramo', valor from retail.fn_parametro_tributario('renta_tramo_uit', '2026-11-02')
union all select 'boletas', valor from retail.fn_parametro_tributario('boletas_tope_pct', '2030-06-01');`);
  esperar("la escala (29,5 % sobre 15 UIT) y el 6 % de las boletas vienen sembrados y se heredan a años futuros", r.ok && lineas(r).map((l) => l.split("|").pop()).join(",") === "0.2950,15.0000,0.0600", r);
}

{
  const r = correr(`begin;\n${cambiaA(FELIPE)}
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
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_utilidad_previa', '2026-01-01', -12500.5, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_costo_previo', '2026-01-01', 180000, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_sin_papel_previo', '2026-01-01', 95000, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_pagada_previa', '2026-01-01', 3800, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_costo_previo', '2026-01-01', -1, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_pagada_previa', '2026-03-01', 10, null)$q$);
select pg_temp.intento($q$select retail.guardar_parametro_tributario('renta_tasa_resto', '2027-01-01', 0.3, null)$q$);
select valor from retail.fn_parametro_tributario('renta_utilidad_previa', '2026-12-31');
select count(*) from retail.fn_parametro_tributario('renta_utilidad_previa', '2027-06-01') where vigente_desde = '2026-01-01';`);
  const [neg, costo, sinPapel, pagada, negativo, marzo, ley, guardada] = lineas(r);
  esperar("se guardan los cuatro de antes del sistema (la utilidad, aunque sea pérdida)", [neg, costo, sinPapel, pagada].every((x) => x === "SIN_ERROR"), r);
  esperar("un costo negativo se rechaza", /de 0 a 100 millones/.test(negativo ?? ""), r);
  esperar("rige desde el 1 de enero", /rigen por año/.test(marzo ?? ""), r);
  esperar("la escala de la ley no se cambia desde la pantalla", /no existe/.test(ley ?? ""), r);
  esperar("la utilidad guardada es la pérdida tal cual", guardada === "-12500.5000", r);
}

{
  const r = correr(`begin;\n${MIGRACION_PARAMETROS}\n${MIGRACION_PARAMETROS}\nselect count(*) from retail.parametros_tributarios where nombre = 'renta_tasa_resto';`);
  esperar("la migración de parámetros se pega dos veces sin duplicar la escala", r.ok && r.salida.split("\n").pop() === "1", r);
}

if (fallas > 0) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodo bien.");
