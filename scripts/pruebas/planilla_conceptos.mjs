#!/usr/bin/env node
/**
 * Prueba de las tareas 12 y 13 de «Las 36 de Finanzas» (`20261106011000_planilla_aportes_cts_grati_y_liquidaciones.sql`).
 *
 * QUÉ CUBRE
 *   · PAGAR AFP, CTS, GRATIFICACIÓN O UNA LIQUIDACIÓN baja la 41 y el banco; no toca el IGV ni un gasto, y no queda «suelto».
 *   · LA PROYECCIÓN trae los aportes del último período, menos lo ya pagado de ese mes, y nunca CTS ni gratificación.
 *   · NO CONTAR DOS VECES: los bonos de gratificación, CTS, vacaciones y bonificación extraordinaria no suben el costo, ni pagado ni provisionado. `pagado`, sí.
 *   · LAS LIQUIDACIONES de Dynamic se listan solo desde el inicio de Finanzas, sin nombres, y se van al registrarlas.
 *   · PEGAR DOS VECES no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK, con Dynamic de ensayo. La base local solo tiene un stub de Dynamic.
 *
 * USO
 *   pnpm pruebas:planilla-conceptos
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const i = process.argv.indexOf("--contenedor");
const CONTENEDOR = i > 0 ? process.argv[i + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261106011000_planilla_aportes_cts_grati_y_liquidaciones.sql"), "utf8");

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let fallos = 0;
let casos = 0;
function verificar(titulo, r, esperados) {
  const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|"))) : {};
  for (const [caso, valor] of Object.entries(esperados)) {
    casos++;
    const ok = r.ok && lineas[caso] === valor;
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 900)}`);
    }
  }
}
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const BANCO = `insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco de prueba', 'banco', '104') returning id as banco \\gset`;
const MES_ANT = `(date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date`;

// Dynamic de ensayo: lo pagado, el calendario, los bonos y las liquidaciones. Sale un período pagado que terminó el mes pasado, 3 personas.
const DYNAMIC = `
create or replace function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select true $f$;
create table if not exists public.periodos_planilla (id uuid primary key, fecha_ini date, fecha_fin date, estado text);
create table public.v_planilla_pagada (periodo_id uuid, persona_id uuid, sede_codigo text, grupo text, total numeric, provision_total numeric, costo_total numeric,
  descuento_pension numeric, retencion_4ta numeric, aporte_essalud numeric);
create table public.movimientos_planilla (periodo_id uuid, persona_id uuid, tipo text, categoria text, monto numeric);
create table public.liquidacion_pagada (persona_id uuid, version integer, fecha_cese date, total numeric, anulada boolean, congelada_at timestamptz);
insert into public.sedes (codigo, nombre, tipo) values ('ZTAL', 'Taller de ensayo', 'taller') on conflict do nothing;
insert into public.periodos_planilla values ('f0f0f0f0-0000-4000-8000-0000000000b1', ${MES_ANT}, ${MES_ANT} + 27, 'pagado');
insert into public.v_planilla_pagada values
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000001', 'ZTAL', 'planilla', 300, 20, 0, 13, 2, 9),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000002', 'ZTAL', 'planilla', 100, 20, 0, 13, 2, 9),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000003', 'ZTAL', 'planilla', 100, 20, 0, 13, 2, 9);
-- Las dos primeras personas cobraron 200 y 50 como gratificación y CTS: «total» ya los trae. El bono «otros» sí es gasto del mes.
insert into public.movimientos_planilla values
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000001', 'bono', 'gratificacion', 200),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000002', 'bono', 'cts', 50),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000003', 'bono', 'otros', 10),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000003', 'descuento', 'gratificacion', 5);
${MIGRACION}
`;

// ---------- Pagar cada parte ----------
verificar("pagar", correr(`
${MIGRACION}
${BANCO}
select retail.registrar_pago_de_planilla(:'banco', '2019-07-20', 500, 'aportes', '2019-06-01', 'AFP de junio', '00000000-0000-4000-8000-0000000000b2') as p \\gset
select 'diario|' || string_agg(cuenta || ':' || debe || '/' || haber, ' ' order by cuenta) from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla = 'pago_planilla';
select 'concepto|' || concepto || ',' || mes from retail.planilla_pagos_concepto where movimiento_id = :'p';
select 'mismo_token|' || (retail.registrar_pago_de_planilla(:'banco', '2019-07-20', 500, 'aportes', '2019-06-01', 'AFP de junio', '00000000-0000-4000-8000-0000000000b2') = :'p');
select 'no_es_suelta|' || count(*) from retail.fn_planilla_salidas_sueltas() where movimiento_id = :'p';
select retail.registrar_movimiento_dinero('pago_planilla', 700, :'banco', null, '2019-07-21', 'Sueldos sin enlazar') as s \\gset
select 'sueldos_si_suelta|' || count(*) from retail.fn_planilla_salidas_sueltas() where movimiento_id = :'s';
select retail.anular_movimiento_dinero(:'p', 'Se registró dos veces');
select 'anulado_fuera_del_diario|' || count(*) from retail.fn_asientos('2019-07-20', '2019-07-20', null) where regla = 'pago_planilla';
select 'rls|' || relrowsecurity || ',' || (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'planilla_pagos_concepto') from pg_class where oid = 'retail.planilla_pagos_concepto'::regclass;
${debeFallar("sin_concepto", `perform retail.registrar_pago_de_planilla((select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), '2019-07-20', 10, 'sueldos', '2019-06-01')`, "P0001")}
${debeFallar("mes_a_medias", `perform retail.registrar_pago_de_planilla((select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), '2019-07-20', 10, 'cts', '2019-06-15')`, "P0001")}
${debeFallar("mes_que_no_empezo", `perform retail.registrar_pago_de_planilla((select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), '2019-07-20', 10, 'cts', '2019-08-01')`, "P0001")}
${debeFallar("desde_caja_fuerte", `perform retail.registrar_pago_de_planilla((select id from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null limit 1), '2019-07-20', 10, 'cts', '2019-06-01')`, "P0001")}
set local request.jwt.claim.sub = '${MICAELA}';
${debeFallar("sin_ser_lider", `perform retail.registrar_pago_de_planilla((select id from retail.cuentas_dinero where nombre = 'Banco de prueba'), '2019-07-20', 10, 'cts', '2019-06-01')`, "42501")}
`), {
  diario: "104:0/500.00 41:500.00/0",
  concepto: "aportes,2019-06-01",
  mismo_token: "true",
  no_es_suelta: "0",
  sueldos_si_suelta: "1",
  anulado_fuera_del_diario: "0",
  rls: "true,0",
  sin_concepto: "ok",
  mes_a_medias: "ok",
  mes_que_no_empezo: "ok",
  desde_caja_fuerte: "ok",
  sin_ser_lider: "ok",
});

// ---------- El costo y la proyección, con Dynamic de ensayo ----------
verificar("costo y proyección", correr(`
${DYNAMIC}
${BANCO}
-- 500 de neto + 3 × (13 + 2 + 9) + 60 de provisión = 632, menos 250 ya provisionados. El bono «otros» y el descuento no cuentan.
select 'costo|' || costo_total from retail.planilla_por_sede where sede_codigo = 'ZTAL';
select 'neto_igual|' || pagado from retail.planilla_por_sede where sede_codigo = 'ZTAL';
select 'aportes|' || aportes from retail.planilla_por_sede where sede_codigo = 'ZTAL';
select 'sale_aporte|' || (s ->> 'monto') || ',' || (s ->> 'clase') from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(6) -> 'salidas') s where s ->> 'id' = 'aportes:' || to_char(${MES_ANT}, 'YYYY-MM');
select 'sin_cts_ni_grati|' || count(*) from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(26) -> 'salidas') s where s ->> 'titulo' ~* 'cts|gratifica';
select retail.registrar_pago_de_planilla(:'banco', retail.fn_hoy_lima(), 30, 'aportes', ${MES_ANT}) as p1 \\gset
select 'tras_pago|' || (s ->> 'monto') from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(6) -> 'salidas') s where s ->> 'id' = 'aportes:' || to_char(${MES_ANT}, 'YYYY-MM');
select retail.registrar_pago_de_planilla(:'banco', retail.fn_hoy_lima(), 42, 'aportes', ${MES_ANT}) as p2 \\gset
select 'pagado_todo|' || count(*) from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(6) -> 'salidas') s where s ->> 'id' = 'aportes:' || to_char(${MES_ANT}, 'YYYY-MM');
select retail.anular_movimiento_dinero(:'p2', 'Prueba');
select 'anular_devuelve|' || (s ->> 'monto') from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(6) -> 'salidas') s where s ->> 'id' = 'aportes:' || to_char(${MES_ANT}, 'YYYY-MM');
`), {
  costo: "382",
  neto_igual: "500",
  aportes: "72",
  sale_aporte: "72,planilla",
  sin_cts_ni_grati: "0",
  tras_pago: "42.00",
  pagado_todo: "0",
  anular_devuelve: "42.00",
});

// ---------- Lo que todavía se provisiona ----------
verificar("provisionado", correr(`
${DYNAMIC}
create or replace function public.fn_proyeccion_periodo(p uuid) returns jsonb language sql stable as $f$
  select jsonb_build_object('feriados', '[]'::jsonb, 'filas', jsonb_build_array(
    jsonb_build_object('sede', 'ZTAL', 'tipo_vinculo', 'planilla', 'sueldo_fijo', false, 'persona_id', 'a0000000-0000-4000-8000-000000000001', 'total', 300, 'provision_total', 20),
    jsonb_build_object('sede', 'ZTAL', 'tipo_vinculo', 'planilla', 'sueldo_fijo', false, 'persona_id', 'a0000000-0000-4000-8000-000000000002', 'total', 100, 'provision_total', 20),
    jsonb_build_object('sede', 'ZTAL', 'tipo_vinculo', 'planilla', 'sueldo_fijo', false, 'persona_id', 'a0000000-0000-4000-8000-000000000003', 'total', 100, 'provision_total', 20)))
$f$;
insert into public.periodos_planilla values ('f0f0f0f0-0000-4000-8000-0000000000a1', '2030-09-29', '2030-10-28', 'abierto');
insert into public.movimientos_planilla values ('f0f0f0f0-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001', 'bono', 'gratificacion', 200);
-- 500 de neto + 60 de provisión = 560, menos 200 ya provisionados.
select 'provisionado|' || (sum(devengado))::numeric(12,2) from retail.fn_planilla_provision_calc('2030-10-01', '2030-10-31', '2030-10-28', '2030-10-28 23:00-05');
`), { provisionado: "360.00" });

// ---------- Las liquidaciones ----------
verificar("liquidaciones", correr(`
${DYNAMIC}
${BANCO}
update retail.parametros_finanzas set inicio_finanzas = ${MES_ANT};
insert into public.liquidacion_pagada values
  ('a0000000-0000-4000-8000-000000000001', 1, ${MES_ANT} + 3, 400, false, ${MES_ANT} + interval '5 days 12 hours'),
  ('a0000000-0000-4000-8000-000000000002', 1, ${MES_ANT} + 3, 900, false, ${MES_ANT} + interval '5 days 12 hours'),
  ('a0000000-0000-4000-8000-000000000002', 2, ${MES_ANT} + 3, 0, true, ${MES_ANT} + interval '6 days 12 hours'),
  ('a0000000-0000-4000-8000-000000000003', 1, '2019-01-10', 777, false, '2019-01-11 12:00-05');
select 'lista|' || personas || ',' || total || ',' || registrado from retail.fn_liquidaciones_por_registrar();
select retail.registrar_pago_de_planilla(:'banco', retail.fn_hoy_lima(), 400, 'liquidacion', ${MES_ANT}) as l \\gset
select 'tras_registrar|' || count(*) from retail.fn_liquidaciones_por_registrar();
select 'sin_nombres|' || count(*) from information_schema.routines r, lateral (select pg_get_function_result(p.oid) f from pg_proc p where p.proname = r.routine_name limit 1) x where r.routine_name = 'fn_liquidaciones_por_registrar' and x.f ~ 'persona_id|nombre';
`), { lista: "1,400,0", tras_registrar: "0", sin_nombres: "0" });

// ---------- Pegar dos veces ----------
verificar("pegar dos veces", correr(`
${MIGRACION}
create temp table antes as select md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.proname in ('fn_flujo_caja_proyeccion', 'fn_planilla_salidas_sueltas', 'fn_planilla_provision_calc') and p.pronamespace = 'retail'::regnamespace;
${MIGRACION}
select 'misma_huella|' || (select count(*) from (select md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.proname in ('fn_flujo_caja_proyeccion', 'fn_planilla_salidas_sueltas', 'fn_planilla_provision_calc') and p.pronamespace = 'retail'::regnamespace except select h from antes) d);
`), { misma_huella: "0" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
