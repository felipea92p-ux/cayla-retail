#!/usr/bin/env node
/**
 * Prueba de «montos válidos en Ventas y Caja» (`20261013204000_ventas_montos_validos_parte1.sql` y `…_parte2.sql`).
 *
 * EL PROBLEMA QUE PRUEBA. /chaos (2026-10-13): `'NaN'::numeric` (y `'Infinity'`) pasaban los CHECK `>= 0` y quedaban en
 * aperturas, cierres y egresos; `cerrar_caja(id, null)` cerraba con las cifras en blanco; el «recibido» no tenía tope (un vuelto de
 * un millón); y `aprobar_devolucion` guardaba un reembolso negativo (−500 en efectivo subía el cajón en 500) o con un medio
 * inventado. Aquí: cada función rechaza con su `hint`, cada tabla rechaza lo que una función no mire, el borde del vuelto (S/ 500
 * justo pasa, un céntimo más no) y lo válido sigue igual. Con controles: sin las migraciones, la NaN y el reembolso negativo pasaban.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK.
 *
 * USO: pnpm pruebas:ventas-montos-validos   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261013204000_ventas_montos_validos_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261013205000_ventas_montos_validos_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const SANDRA = "22222222-2222-4222-8222-000000000005";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// Los cuatro reemplazos de la parte 2, para deshacerlos en los controles: [viejo, nuevo].
const REEMPLAZOS = [...PARTE2.matchAll(/'(retail\.[a-z_]+\([^']*\))',\s*\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)].map((m) => ({
  firma: m[1],
  viejo: m[2],
  nuevo: m[3],
}));
if (REEMPLAZOS.length !== 4) throw new Error(`esperaba 4 reemplazos en la parte 2 y encontré ${REEMPLAZOS.length}`);
const DESHACER = `
${REEMPLAZOS.map((r) => `do $d$ begin execute replace(pg_get_functiondef('${r.firma}'::regprocedure), $n$${r.nuevo}$n$, $o$${r.viejo}$o$); end $d$;`).join("\n")}
${[...PARTE1.matchAll(/pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => `alter table retail.${m[1]} drop constraint if exists ${m[2]};`).join("\n")}
`;

function preparar({ quien = FELIPE, sinCandados = false } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sinCandados ? DESHACER : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT96' when 'factura' then 'FT96' when 'nota_credito' then 'BC96' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura', 'nota_credito');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
set local request.jwt.claim.sub = '${quien}';
`;
}

const venta = (pagos, como = "venta") =>
  `select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', 0)),
    ${pagos}, null, gen_random_uuid(), 'boleta') as ${como} \\gset\n`;
const efectivo = (recibido) => `jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio'::numeric, 'recibido', ${recibido}))`;
const devolucionPendiente = `${venta(`jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric))`)}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as dev \\gset
set local request.jwt.claim.sub = '${SANDRA}';
`;

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
const rechazaCon = (patron) => (r) => !r.ok && patron.test(r.error);

// --- Controles: sin las migraciones, pasaba ---
{
  const r = correr(`${preparar({ sinCandados: true })}
select retail.registrar_movimiento_caja(:'caja', 'egreso', 'NaN', 'Retiro de efectivo', null, false, gen_random_uuid()) as m \\gset
select 'nan|' || (select monto::text from retail.caja_movimientos where id = :'m');`);
  esperar("CONTROL: sin las migraciones, un egreso en NaN se guardaba", r.ok && r.salida.includes("nan|NaN"), r.salida || r.error);
  const r2 = correr(`${preparar({ sinCandados: true })}${devolucionPendiente}
select retail.aprobar_devolucion(:'dev', -500, 'efectivo') as _a \\gset
select 'reembolso|' || (select reembolso_monto from retail.devoluciones where id = :'dev');`);
  esperar("CONTROL: sin las migraciones, un reembolso de −500 en efectivo se guardaba", r2.ok && r2.salida.includes("reembolso|-500.00"), r2.salida || r2.error);
}

// --- Caja ---
const montoInvalido = rechazaCon(/monto_invalido/);
for (const valor of ["'NaN'", "'Infinity'"]) {
  esperar(`abrir la caja con ${valor} se rechaza`, montoInvalido(correr(`${preparar()}
select retail.cerrar_caja(:'caja', 100) as _cc \\gset
select retail.abrir_caja(:'ubic', ${valor}, 'prueba');`)), "pasó");
  esperar(`una salida de caja de ${valor} se rechaza`, montoInvalido(correr(`${preparar()}
select retail.registrar_movimiento_caja(:'caja', 'egreso', ${valor}, 'Retiro de efectivo', null, false, gen_random_uuid());`)), "pasó");
  esperar(`cerrar con lo contado en ${valor} se rechaza`, montoInvalido(correr(`${preparar()}
select retail.cerrar_caja(:'caja', ${valor});`)), "pasó");
}
esperar("cerrar con lo contado en blanco (NULL) se rechaza", montoInvalido(correr(`${preparar()}\nselect retail.cerrar_caja(:'caja', null);`)), "pasó");
esperar("cerrar trasladando NaN se rechaza", montoInvalido(correr(`${preparar()}\nselect retail.cerrar_caja(:'caja', 100, 'NaN', 'caja_fuerte');`)), "pasó");
{
  const r = correr(`${preparar()}\nselect * from retail.cerrar_caja(:'caja', 100) \\gset\nselect 'estado|' || (select estado from retail.cajas where id = :'caja');`);
  esperar("cerrar con un monto de verdad sigue funcionando", r.ok && r.salida.includes("estado|cerrada"), r.salida || r.error);
}
esperar("la tabla rechaza un egreso en NaN aunque una función no lo mire", rechazaCon(/caja_movimientos_montos_finitos/)(correr(`${preparar()}
insert into retail.caja_movimientos (caja_id, tipo, monto, motivo) values (:'caja', 'egreso', 'NaN', 'Retiro de efectivo');`)), "pasó");

// --- El vuelto: S/ 500 justo pasa, un céntimo más no ---
{
  const r = correr(`${preparar()}${venta(efectivo(":'precio'::numeric + 500"))}
select 'vuelto|' || (select recibido - monto from retail.venta_pagos where venta_id = :'venta' and metodo = 'efectivo');`);
  esperar("una venta con S/ 500 de vuelto justo se acepta", r.ok && r.salida.includes("vuelto|500.00"), r.salida || r.error);
}
esperar("una venta con S/ 500.01 de vuelto se rechaza", rechazaCon(/venta_pagos_recibido_con_tope/)(correr(`${preparar()}${venta(efectivo(":'precio'::numeric + 500.01"))}`)), "pasó");
esperar("una venta con un millón «recibido» se rechaza", rechazaCon(/venta_pagos_recibido_con_tope/)(correr(`${preparar()}${venta(efectivo("1000000"))}`)), "pasó");
esperar("un apartado con S/ 600 de vuelto en el adelanto se rechaza", rechazaCon(/separacion_pagos_recibido_con_tope/)(correr(`${preparar()}
select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 30, 'recibido', 630)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987111222', p_devolucion_medio => 'yape');`)), "pasó");

// --- El reembolso de una devolución ---
const reembolsoInvalido = rechazaCon(/reembolso_invalido/);
const metodoInvalido = rechazaCon(/reembolso_metodo_invalido/);
esperar("un reembolso de −500 en efectivo se rechaza", reembolsoInvalido(correr(`${preparar()}${devolucionPendiente}\nselect retail.aprobar_devolucion(:'dev', -500, 'efectivo');`)), "pasó");
esperar("un reembolso en NaN se rechaza", reembolsoInvalido(correr(`${preparar()}${devolucionPendiente}\nselect retail.aprobar_devolucion(:'dev', 'NaN', 'yape');`)), "pasó");
esperar("un reembolso por un medio inventado se rechaza", metodoInvalido(correr(`${preparar()}${devolucionPendiente}\nselect retail.aprobar_devolucion(:'dev', 10, 'bitcoin');`)), "pasó");
esperar("un reembolso con plata y sin medio se rechaza", metodoInvalido(correr(`${preparar()}${devolucionPendiente}\nselect retail.aprobar_devolucion(:'dev', 10, null);`)), "pasó");
{
  const r = correr(`${preparar()}${devolucionPendiente}
select retail.aprobar_devolucion(:'dev', 10, 'yape') as _a \\gset
select 'estado|' || (select estado || ':' || reembolso_monto || ':' || reembolso_metodo from retail.devoluciones where id = :'dev');`);
  esperar("un reembolso de S/ 10 por Yape sigue funcionando", r.ok && r.salida.includes("estado|aprobada:10.00:yape"), r.salida || r.error);
  const r2 = correr(`${preparar()}${devolucionPendiente}
select retail.aprobar_devolucion(:'dev', null, null) as _a \\gset
select 'estado|' || (select estado from retail.devoluciones where id = :'dev');`);
  esperar("aprobar sin reembolso (solo vuelve la prenda) sigue funcionando", r2.ok && r2.salida.includes("estado|aprobada"), r2.salida || r2.error);
}
esperar("la tabla rechaza un reembolso negativo aunque una función no lo mire", rechazaCon(/devoluciones_reembolso_valido/)(correr(`${preparar()}${devolucionPendiente}
update retail.devoluciones set reembolso_monto = -5, reembolso_metodo = 'yape' where id = :'dev';`)), "pasó");

// --- Las migraciones ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE2}\n${PARTE1}\n${PARTE2}
select 'candados|' || count(*) from pg_constraint where conname like '%montos_finitos' or conname like '%recibido_con_tope' or conname in ('devoluciones_reembolso_valido', 'devoluciones_reembolso_metodo_valido', 'devoluciones_reembolso_con_metodo');
select 'guardas|' || (length(d) - length(replace(d, 'monto_invalido', ''))) / length('monto_invalido') from pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure) d;`);
  esperar("las dos partes se pueden pegar dos veces: 20 candados y cada guarda una sola vez", r.ok && r.salida.includes("candados|20") && r.salida.includes("guardas|2"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
