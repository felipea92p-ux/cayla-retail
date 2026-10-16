#!/usr/bin/env node
/**
 * Prueba de `20261013211000_apartados_y_proformas_candados.sql` (/chaos 2026-10-13).
 *
 * EL PROBLEMA QUE PRUEBA. Tres huecos chicos (solo por la API): un apartado con el celular «abcdefghi» quedaba sin celular sin que
 * nadie lo supiera; una proforma nacía vencida; y una proforma se marcaba cobrada con una venta de OTRAS prendas. Aquí cada uno se
 * rechaza con su `hint`, y lo válido pasa igual (celular vacío o con espacios, vencimiento futuro o sin él, la venta que la cobró,
 * también con una bolsa de más). Con controles: sin la migración, los tres pasaban.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK.
 *
 * USO: pnpm pruebas:apartados-proformas-candados   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261013211000_apartados_y_proformas_candados.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const REEMPLAZOS = [...MIGRACION.matchAll(/'(retail\.[a-z_]+\([^']*\))',\s*\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$,\s*1\);/g)].map((m) => ({ firma: m[1], viejo: m[2], nuevo: m[3] }));
if (REEMPLAZOS.length !== 3) throw new Error(`esperaba 3 reemplazos y encontré ${REEMPLAZOS.length}`);
const SIN_MIGRACION = REEMPLAZOS.map((r) => `do $d$ begin execute replace(pg_get_functiondef('${r.firma}'::regprocedure), $n$${r.nuevo}$n$, $o$${r.viejo}$o$); end $d$;`).join("\n");

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
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT94' when 'factura' then 'FT94' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as w, precio as precio_w from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'w', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
`;
}

const separar = (celular) => `select retail.separar_prendas(p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 30)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => ${celular === null ? "null" : `'${celular}'`},
  p_devolucion_medio => 'transferencia', p_devolucion_cci => '00212345678901234567') as sep \\gset
select 'celular|' || coalesce(clienta_celular, '-') from retail.separaciones where id = :'sep';`;
const proforma = (vence) => `select retail.crear_proforma(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  'Cliente de prueba', null, ${vence}) as prof \\gset
select 'proforma|' || estado from retail.proformas where id = :'prof';`;
const vender = (lineas, como = "venta") => `select retail.registrar_venta(:'ubic', jsonb_build_array(${lineas.join(", ")}),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', ${lineas.map((l) => (l.includes(":'w'") ? ":'precio_w'::numeric" : ":'precio'::numeric")).join(" + ")})),
  null, gen_random_uuid(), 'boleta') as ${como} \\gset\n`;
const lineaV = `jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', 0)`;
const lineaW = `jsonb_build_object('variante_id', :'w', 'cantidad', 1, 'precio_unitario', :'precio_w'::numeric, 'descuento_unitario', 0)`;
const marcar = `select retail.marcar_proforma_cobrada(:'prof', :'venta') as _m \\gset
select 'proforma|' || estado from retail.proformas where id = :'prof';`;

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
const rechazaCon = (hint) => (r) => !r.ok && r.error.includes(hint);

// --- Controles ---
{
  const r = correr(`${preparar({ sinMigracion: true })}${separar("abcdefghi")}`);
  esperar("CONTROL: sin la migración, un celular «abcdefghi» se descartaba en silencio", r.ok && r.salida.includes("celular|-"), r.salida || r.error);
  const r2 = correr(`${preparar({ sinMigracion: true })}${proforma("now() - interval '1 day'")}`);
  esperar("CONTROL: sin la migración, una proforma nacía vencida", r2.ok && r2.salida.includes("proforma|vigente"), r2.salida || r2.error);
  const r3 = correr(`${preparar({ sinMigracion: true })}${proforma("now() + interval '7 days'")}${vender([lineaW])}${marcar}`);
  esperar("CONTROL: sin la migración, una proforma se marcaba con una venta de otras prendas", r3.ok && r3.salida.includes("proforma|convertida"), r3.salida || r3.error);
}

// --- El celular del apartado ---
esperar("un celular «abcdefghi» se rechaza", rechazaCon("celular_invalido")(correr(`${preparar()}${separar("abcdefghi")}`)), "pasó");
{
  const r = correr(`${preparar()}${separar("987 111 222")}`);
  esperar("un celular con espacios se guarda limpio", r.ok && r.salida.includes("celular|987111222"), r.salida || r.error);
  const r2 = correr(`${preparar()}${separar("")}`);
  esperar("sin celular (vacío) se aparta igual", r2.ok && r2.salida.includes("celular|-"), r2.salida || r2.error);
  const r3 = correr(`${preparar()}${separar(null)}`);
  esperar("sin celular (null) se aparta igual", r3.ok && r3.salida.includes("celular|-"), r3.salida || r3.error);
}

// --- La proforma ---
esperar("una proforma que venció ayer no se crea", rechazaCon("proforma_vencida_al_crear")(correr(`${preparar()}${proforma("now() - interval '1 day'")}`)), "pasó");
{
  const r = correr(`${preparar()}${proforma("now() + interval '7 days'")}`);
  esperar("una proforma que vence en 7 días se crea", r.ok && r.salida.includes("proforma|vigente"), r.salida || r.error);
  const r2 = correr(`${preparar()}${proforma("null")}`);
  esperar("una proforma sin vencimiento se crea", r2.ok && r2.salida.includes("proforma|vigente"), r2.salida || r2.error);
}
esperar("marcarla con una venta de otras prendas se rechaza", rechazaCon("proforma_otras_prendas")(correr(`${preparar()}${proforma("now() + interval '7 days'")}${vender([lineaW])}${marcar}`)), "pasó");
{
  const r = correr(`${preparar()}${proforma("now() + interval '7 days'")}${vender([lineaV])}${marcar}`);
  esperar("marcarla con la venta que la cobró la convierte", r.ok && r.salida.includes("proforma|convertida"), r.salida || r.error);
  const r2 = correr(`${preparar()}${proforma("now() + interval '7 days'")}${vender([lineaV, lineaW])}${marcar}`);
  esperar("con una línea de más en la venta (una bolsa), también", r2.ok && r2.salida.includes("proforma|convertida"), r2.salida || r2.error);
}

// --- La migración ---
{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}
select 'celular|' || (length(d) - length(replace(d, 'celular_invalido', ''))) / length('celular_invalido') from pg_get_functiondef('${REEMPLAZOS[0].firma}'::regprocedure) d;
select 'vence|' || (length(d) - length(replace(d, 'proforma_vencida_al_crear', ''))) / length('proforma_vencida_al_crear') from pg_get_functiondef('${REEMPLAZOS[1].firma}'::regprocedure) d;
select 'otras|' || (length(d) - length(replace(d, 'proforma_otras_prendas', ''))) / length('proforma_otras_prendas') from pg_get_functiondef('${REEMPLAZOS[2].firma}'::regprocedure) d;`);
  esperar("la migración se puede pegar dos veces: cada candado una sola vez", r.ok && ["celular|1", "vence|1", "otras|1"].every((x) => r.salida.includes(x)), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
