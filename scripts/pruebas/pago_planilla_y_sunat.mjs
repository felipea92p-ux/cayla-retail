#!/usr/bin/env node
/**
 * Prueba del pago de la planilla y del pago a SUNAT — ADR-0417, situaciones 15 y 16 (`20261016002000_pago_planilla_y_sunat.sql`).
 *
 * QUÉ CUBRE
 *   · EL LÍDER LOS REGISTRA: salen de un banco, sin destino, de la empresa (ubicación nula), y quedan vigentes.
 *   · EL DIARIO LOS ASIENTA SOLO: pago de planilla 41 | 104; pago a SUNAT 4011 | 104 (`fn_asientos`, el mismo día).
 *   · LOS CANDADOS: con destino, desde una caja fuerte, con comisión, o sin ser líder: no entran.
 *   · SE ANULAN como cualquier movimiento, y el Diario deja de verlos.
 *   · PEGAR DOS VECES no cambia ninguna función (los reemplazos anclados no se repiten).
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK; fechas de 2019; sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:pago-planilla-y-sunat
 *   node scripts/pruebas/pago_planilla_y_sunat.mjs --contenedor <otro>
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261016002000_pago_planilla_y_sunat.sql"), "utf8");

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
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

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
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|")));
  for (const [caso, valor] of Object.entries(esperados)) {
    esperar(`${titulo}: ${caso}`, lineas[caso] === valor, { esperado: valor, salio: lineas[caso], todo: lineas });
  }
}
/** Un bloque que tiene que fallar con el código dado; si no falla, la escena entera cae. */
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const SEMILLA = `
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco de prueba', 'banco', '104') returning id as banco \\gset
select id as fuerte from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null limit 1 \\gset
`;

// ---------- Escena 1: se registran, el diario los asienta, se anulan ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
${SEMILLA}
select retail.registrar_movimiento_dinero('pago_planilla', 1000, :'banco', null, '2019-07-20', 'Planilla de junio 2019') as planilla \\gset
select retail.registrar_movimiento_dinero('pago_sunat', 500, :'banco', null, '2019-07-20', 'IGV de junio 2019') as sunat \\gset
select 'planilla_fila|' || tipo || ',' || estado || ',' || (cuenta_destino_id is null) || ',' || (ubicacion_id is null) || ',' || monto from retail.movimientos_dinero where id = :'planilla';
select 'sunat_fila|' || tipo || ',' || estado || ',' || (cuenta_destino_id is null) || ',' || monto from retail.movimientos_dinero where id = :'sunat';
select 'texto|' || retail.fn_texto_movimiento_dinero('pago_planilla') || ',' || retail.fn_texto_movimiento_dinero('pago_sunat');
-- El Diario: la deuda baja (debe) y el banco baja (haber).
select 'diario_planilla|' || string_agg(cuenta || ':' || debe || '/' || haber, ' ' order by cuenta)
  from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla = 'pago_planilla';
select 'diario_sunat|' || string_agg(cuenta || ':' || debe || '/' || haber, ' ' order by cuenta)
  from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla = 'pago_sunat';
select 'diario_cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla in ('pago_planilla', 'pago_sunat');
-- Anular: el movimiento queda anulado y el Diario deja de verlo.
select retail.anular_movimiento_dinero(:'sunat', 'Se registró dos veces');
select 'anulado|' || estado from retail.movimientos_dinero where id = :'sunat';
select 'diario_sin_sunat|' || count(*) from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla = 'pago_sunat';
`);
  verificar("pago de planilla y SUNAT", r, {
    planilla_fila: "pago_planilla,vigente,true,true,1000.00",
    sunat_fila: "pago_sunat,vigente,true,500.00",
    texto: "Pago de la planilla,Pago a SUNAT (IGV)",
    diario_planilla: "104:0/1000.00 41:1000.00/0",
    diario_sunat: "104:0/500.00 4011:500.00/0",
    diario_cuadra: "true",
    anulado: "anulado",
    diario_sin_sunat: "0",
  });
}

// ---------- Escena 2: los candados ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
${SEMILLA}
${debeFallar("con_destino", `perform retail.registrar_movimiento_dinero('pago_planilla', 100, (select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), (select id from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null limit 1), '2019-07-20', null)`, "P0001")}
${debeFallar("desde_caja_fuerte", `perform retail.registrar_movimiento_dinero('pago_sunat', 100, (select id from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null limit 1), null, '2019-07-20', null)`, "P0001")}
${debeFallar("con_comision", `perform retail.registrar_movimiento_dinero('pago_sunat', 100, (select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), null, '2019-07-20', null, 5)`, "P0001")}
${debeFallar("monto_cero", `perform retail.registrar_movimiento_dinero('pago_planilla', 0, (select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), null, '2019-07-20', null)`, "P0001")}
${cambiaA(MICAELA)}
${debeFallar("sin_ser_lider", `perform retail.registrar_movimiento_dinero('pago_planilla', 100, (select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), null, '2019-07-20', null)`, "42501")}
`);
  verificar("candados", r, { con_destino: "ok", desde_caja_fuerte: "ok", con_comision: "ok", monto_cero: "ok", sin_ser_lider: "ok" });
}

// ---------- Escena 3: pegar dos veces ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) as huella_1
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_movimientos_dinero_validar', 'registrar_movimiento_dinero', 'fn_texto_movimiento_dinero', 'fn_asientos_dinero_y_caja') \\gset
${MIGRACION}
select 'misma_huella|' || (md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) = :'huella_1')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_movimientos_dinero_validar', 'registrar_movimiento_dinero', 'fn_texto_movimiento_dinero', 'fn_asientos_dinero_y_caja');
`);
  verificar("idempotente", r, { misma_huella: "true" });
}

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
