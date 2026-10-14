#!/usr/bin/env node
/**
 * Prueba de `20261013210000_documento_del_comprobante.sql`: una boleta o una factura lleva un DNI de 8 dígitos o un RUC de 11.
 *
 * EL PROBLEMA QUE PRUEBA. /chaos (2026-10-13) emitió una factura con un RUC de 10 dígitos y una boleta con un DNI de 7: la pantalla
 * avisaba y dejaba emitir. Aquí: la venta se rechaza con `documento_invalido`; lo bien escrito, «sin
 * documento» y el carné siguen igual; el respaldo de la tabla atrapa un insert directo; y una boleta vieja con un DNI mal escrito
 * (antes de la regla) sigue cambiando de estado y emitiendo su nota de crédito. Con control: sin la migración, la boleta salía.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK.
 *
 * USO: pnpm pruebas:comprobante-documento-valido   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261013210000_documento_del_comprobante.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const PAR = MIGRACION.match(/'retail\.emitir_comprobante\([^']*\)',\s*\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/);
if (!PAR) throw new Error("no encontré el reemplazo de emitir_comprobante");
const SIN_MIGRACION = `
do $d$ begin
  execute replace(pg_get_functiondef('retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)'::regprocedure), $n$${PAR[2]}$n$, $o$${PAR[1]}$o$);
end $d$;
alter table retail.comprobantes disable trigger comprobantes_documento_valido;
`;

function preparar({ sinMigracion = false } = {}) {
  return `
begin;
${MIGRACION}
${sinMigracion ? SIN_MIGRACION : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT95' when 'factura' then 'FT95' when 'nota_credito' then 'BC95' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura', 'nota_credito');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
`;
}

const vender = (tipo, tipoDoc, numDoc, como = "venta") =>
  `select retail.registrar_venta(p_ubicacion_id => :'ubic',
    p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', 0)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'precio'::numeric)), p_token => gen_random_uuid(),
    p_tipo_comprobante => '${tipo}', p_cliente_tipo_doc => '${tipoDoc}', p_cliente_num_doc => ${numDoc === null ? "null" : `'${numDoc}'`},
    p_cliente_nombre => 'Cliente de prueba') as ${como} \\gset\n`;
const doc = (como = "venta") => `select 'doc|' || tipo || ':' || cliente_tipo_doc || ':' || coalesce(cliente_num_doc, '-') from retail.comprobantes where venta_id = :'${como}';`;

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechaza = (r) => !r.ok && /documento_invalido/.test(r.error);

{
  const r = correr(`${preparar({ sinMigracion: true })}${vender("boleta", "dni", "1234567")}${doc()}`);
  esperar("CONTROL: sin la migración, una boleta con un DNI de 7 dígitos salía", r.ok && r.salida.includes("doc|boleta:dni:1234567"), r.salida || r.error);
}
esperar("una boleta con un DNI de 7 dígitos se rechaza", rechaza(correr(`${preparar()}${vender("boleta", "dni", "1234567")}`)), "pasó");
esperar("una boleta con un DNI con letras se rechaza", rechaza(correr(`${preparar()}${vender("boleta", "dni", "1234567A")}`)), "pasó");
esperar("una factura con un RUC de 10 dígitos se rechaza", rechaza(correr(`${preparar()}${vender("factura", "ruc", "2012345678")}`)), "pasó");
esperar("una factura con un RUC de 12 dígitos se rechaza", rechaza(correr(`${preparar()}${vender("factura", "ruc", "201234567890")}`)), "pasó");
{
  const r = correr(`${preparar()}${vender("boleta", "dni", "12345678")}${doc()}`);
  esperar("una boleta con un DNI de 8 dígitos sale", r.ok && r.salida.includes("doc|boleta:dni:12345678"), r.salida || r.error);
  const r2 = correr(`${preparar()}${vender("factura", "ruc", "20123456789")}${doc()}`);
  esperar("una factura con un RUC de 11 dígitos sale", r2.ok && r2.salida.includes("doc|factura:ruc:20123456789"), r2.salida || r2.error);
  const r3 = correr(`${preparar()}${vender("boleta", "sin_documento", null)}${doc()}`);
  esperar("una boleta «sin documento» sale como siempre", r3.ok && r3.salida.includes("doc|boleta:sin_documento:-"), r3.salida || r3.error);
  const r4 = correr(`${preparar()}${vender("boleta", "carne_extranjeria", "001234567")}${doc()}`);
  esperar("una boleta con carné de extranjería sale como siempre", r4.ok && r4.salida.includes("doc|boleta:carne_extranjeria:001234567"), r4.salida || r4.error);
}
{
  const r = correr(`${preparar()}
insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, subtotal, igv, total, items, estado)
  values (:'ubic', 'boleta', 'BT95', 900, 'dni', '123', 10, 1.8, 11.8, '[]'::jsonb, 'pendiente');`);
  esperar("el respaldo de la tabla atrapa una boleta con DNI mal escrito insertada directo", rechaza(r), r.ok ? "pasó" : r.error);
}
{
  // Una boleta vieja (antes de la regla) con un DNI de 7: se crea con el respaldo apagado y después se prende.
  const vieja = `${preparar({ sinMigracion: true })}${vender("boleta", "dni", "1234567")}
select id as boleta from retail.comprobantes where venta_id = :'venta' \\gset
${MIGRACION}
alter table retail.comprobantes enable trigger comprobantes_documento_valido;
`;
  const r = correr(`${vieja}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = :'boleta';
select 'estado|' || estado from retail.comprobantes where id = :'boleta';`);
  esperar("una boleta vieja con un DNI mal escrito sigue cambiando de estado", r.ok && r.salida.includes("estado|aceptado"), r.salida || r.error);
  const r2 = correr(`${vieja}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = :'boleta';
insert into retail.series_comprobantes (ubicacion_id, tipo, serie) values (:'ubic', 'nota_credito', 'BC95');
select retail.emitir_nota(:'boleta', 'nota_credito', 'devolución de prueba', 10, 1.8, 11.8, null) as nota \\gset
select 'nota|' || tipo || ':' || cliente_num_doc from retail.comprobantes where id = :'nota';`);
  esperar("y emite su nota de crédito", r2.ok && r2.salida.includes("nota|nota_credito:1234567"), r2.salida || r2.error);
}
{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}
select 'disparador|' || count(*) from pg_trigger where tgname = 'comprobantes_documento_valido';
select 'guarda|' || (length(d) - length(replace(d, 'fn_problema_documento_comprobante(', ''))) / length('fn_problema_documento_comprobante(')
  from pg_get_functiondef('retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)'::regprocedure) d;`);
  esperar("la migración se puede pegar dos veces: un disparador y la guarda una sola vez", r.ok && r.salida.includes("disparador|1") && r.salida.includes("guarda|2"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
