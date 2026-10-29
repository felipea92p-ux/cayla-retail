#!/usr/bin/env node
/**
 * Prueba de la salida del banco de la planilla (ADR-0567). Migración 20261029052000.
 *
 * La base local solo tiene un STUB de Dynamic, así que cada escena arma dentro de su transacción las piezas de Dynamic que se leen
 * (`periodos_planilla`, `periodo_grupo_pago`, `v_planilla_pagada` y `fn_es_admin_o_lider`, que aquí obedece a `prueba.dynamic_admin`;
 * `datos_personales` ya está en el stub), corre la migración TAL CUAL está en el repo y hace ROLLBACK: no deja rastro. Fechas de 2019.
 *
 * Qué garantiza:
 *   1. El banco del colaborador sale de las grafías reales de Dynamic; una caja «de Ahorro y Crédito» u otro banco no es el BCP.
 *   2. Un grupo pagado se parte por banco: personas y neto (lo que recibe cada persona que cobra algo); quien no tiene banco reconocido
 *      va a «sin_banco»; quien no cobra nada, o queda en negativo, no suma ni resta; un tramo sin plata no pide salida.
 *   3. Un grupo congelado pero sin pagar, o de un período que terminó antes del inicio de Finanzas, no aparece.
 *   4. Sin ser líder o sin ver la planilla en Dynamic, vacío; sin las tablas de Dynamic, vacío y sin error.
 *   5. Un grupo con todos sus tramos registrados con el mismo monto deja de aparecer; con otro monto, aparece y dice cuánto se registró;
 *      si su salida se anula, el tramo vuelve a pedirla.
 *   6. Un tramo no puede tener dos salidas enlazadas; la migración se puede pegar dos veces.
 *   7. De qué cuenta sale cada banco (20261029053000): solo un banco activo, solo el líder o Configuración, firma y deja historia, repetir
 *      lo mismo no escribe, una cuenta archivada deja de proponerse, y ni una escritura directa mete una cuenta que no es banco.
 *
 * USO
 *   pnpm pruebas:planilla-salidas   → necesita el stack local (`npx supabase start`)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261029052000_planilla_salidas_por_registrar.sql"), "utf8");
const CUENTAS = readFileSync(join(RAIZ, "supabase", "migrations", "20261029053000_planilla_cuenta_por_banco.sql"), "utf8");

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
  const lineas = Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)]));
  for (const [caso, valor] of Object.entries(esperados)) {
    esperar(`${titulo}: ${caso}`, lineas[caso] === valor, { esperado: valor, salio: lineas[caso], todo: lineas });
  }
}

const P1 = "00000000-0000-4000-8000-0000000005a1"; // jul-2019, dentro de Finanzas
const P0 = "00000000-0000-4000-8000-0000000005a0"; // may-2019, antes del inicio de Finanzas

// Las piezas de Dynamic que se leen, como tablas de ensayo (solo las columnas que se usan).
const DYNAMIC = `
-- Si la base ya trae una Dynamic de ensayo (o la de producción), se reemplaza dentro de la transacción: solo cuenta lo de la escena.
drop table if exists public.periodos_planilla, public.periodo_grupo_pago, public.v_planilla_pagada cascade;
create table public.periodos_planilla (id uuid primary key, fecha_ini date, fecha_fin date, estado text);
create table public.periodo_grupo_pago (periodo_id uuid, grupo text, estado text, pagado_at timestamptz);
-- \`datos_personales\` ya existe en el stub local (con \`entidad_bancaria\`); sin la llave a \`personas\` para no sembrar personas.
alter table public.datos_personales add column if not exists entidad_bancaria text;
alter table public.datos_personales drop constraint if exists datos_personales_persona_id_fkey;
create table public.v_planilla_pagada (periodo_id uuid, persona_id uuid, grupo text, total numeric);
create or replace function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select coalesce(current_setting('prueba.dynamic_admin', true), 'si') = 'si' $f$;
do $d$ begin
  if to_regclass('retail.planilla_por_sede') is null then execute 'create view retail.planilla_por_sede as select 1 as ensayo'; end if;
end $d$;
insert into public.periodos_planilla values
  ('${P1}', '2019-06-29', '2019-07-28', 'abierto'),
  ('${P0}', '2019-04-29', '2019-05-28', 'pagado');
update retail.parametros_finanzas set inicio_finanzas = '2019-06-01' where id;
`;

/** N personas de un grupo, todas con el mismo banco escrito y el mismo neto. */
const PERSONAS = (n, periodo, grupo, banco, total) =>
  `with p as (select gen_random_uuid() as id from generate_series(1, ${n}))
   , d as (insert into public.datos_personales (persona_id, entidad_bancaria) select id, ${banco === null ? "null" : `'${banco}'`} from p returning persona_id)
   insert into public.v_planilla_pagada select '${periodo}', persona_id, '${grupo}', ${total} from d;\n`;
const PAGADO = (periodo, grupo, cuando) => `insert into public.periodo_grupo_pago values ('${periodo}', '${grupo}', 'pagado', '${cuando}');\n`;
const LEER = `select banco || '|' || personas || ',' || neto || ',' || coalesce(registrado::text, '-') from retail.fn_planilla_salidas_por_registrar() where periodo_id = '${P1}' and grupo = 'planilla';\n`;

// ---------- Escena 1: el banco del colaborador ----------
{
  const grafias = [
    ["bcp", "BCP"],
    ["credito_mayus", "BANCO DE CREDITO"],
    ["credito_tilde", "Banco de Crédito del Perú"],
    ["interbank", "Interbank"],
    ["interbank_mayus", "INTERBANK"],
    ["bcp_espacios", "  bcp  "],
    ["caja", "Caja Municipal de Ahorro y Crédito"],
    ["otro_banco", "BBVA"],
    ["numero", "19100000000000"],
    ["vacio", ""],
  ];
  const r = correr(`
begin;
${MIGRACION}
${grafias.map(([k, t]) => `select '${k}|' || coalesce(retail.fn_banco_del_colaborador('${t}'), 'nulo');`).join("\n")}
select 'nulo_de_verdad|' || coalesce(retail.fn_banco_del_colaborador(null), 'nulo');
`);
  verificar("el banco del colaborador", r, {
    bcp: "bcp",
    credito_mayus: "bcp",
    credito_tilde: "bcp",
    interbank: "interbank",
    interbank_mayus: "interbank",
    bcp_espacios: "bcp",
    caja: "nulo",
    otro_banco: "nulo",
    numero: "nulo",
    vacio: "nulo",
    nulo_de_verdad: "nulo",
  });
}

// ---------- Escena 2: un grupo pagado se parte por banco; lo que no corresponde no aparece ----------
{
  const r = correr(`
begin;
${DYNAMIC}
${MIGRACION}
${PERSONAS(3, P1, "planilla", "BCP", 1000)}${PERSONAS(1, P1, "planilla", "BCP", -50)}${PERSONAS(2, P1, "planilla", "Interbank", 500.255)}${PERSONAS(1, P1, "planilla", "Scotiabank", 300)}${PERSONAS(1, P1, "planilla", null, 0)}
${PAGADO(P1, "planilla", "2019-07-31 03:00:00+00")}
${PERSONAS(2, P1, "rxh", "BCP", 800)}
insert into public.periodo_grupo_pago values ('${P1}', 'rxh', 'abierto', null);
${PERSONAS(4, P0, "planilla", "BCP", 900)}${PAGADO(P0, "planilla", "2019-06-01 15:00:00+00")}
${cambiaA(FELIPE)}
${LEER}
select 'pagado_el|' || string_agg(distinct pagado_el::text, ',') from retail.fn_planilla_salidas_por_registrar();
select 'rxh_sin_pagar|' || count(*) from retail.fn_planilla_salidas_por_registrar() where grupo = 'rxh';
select 'antes_del_inicio|' || count(*) from retail.fn_planilla_salidas_por_registrar() where periodo_id = '${P0}';
select 'sin_plata|' || count(*) from retail.fn_planilla_salidas_por_registrar() where neto <= 0;
select 'sin_persona|' || (pg_get_function_result('retail.fn_planilla_salidas_por_registrar()'::regprocedure) !~ '(^|, )(persona_id|nombre) ');
`);
  verificar("un grupo pagado partido por banco", r, {
    // Quien queda en negativo (un descuento a deber) no le resta al banco: el banco paga a los otros tres.
    bcp: "3,3000.00,-",
    // 2 × 500,255 = 1000,51: se redondea la suma, no cada sueldo.
    interbank: "2,1000.51,-",
    sin_banco: "1,300.00,-",
    pagado_el: "2019-07-30",
    rxh_sin_pagar: "0",
    antes_del_inicio: "0",
    sin_plata: "0",
    sin_persona: "true",
  });
}

// ---------- Escena 3: quién lo ve ----------
{
  const base = `
begin;
${DYNAMIC}
${MIGRACION}
${PERSONAS(3, P1, "planilla", "BCP", 1000)}${PAGADO(P1, "planilla", "2019-07-31 03:00:00+00")}
`;
  const r = correr(`${base}
${cambiaA(FELIPE)}
select 'lider_con_dynamic|' || count(*) from retail.fn_planilla_salidas_por_registrar();
set local prueba.dynamic_admin = 'no';
select 'lider_sin_dynamic|' || count(*) from retail.fn_planilla_salidas_por_registrar();
set local prueba.dynamic_admin = 'si';
${cambiaA(MICAELA)}
select 'colaboradora|' || count(*) from retail.fn_planilla_salidas_por_registrar();
set local role authenticated;
${cambiaA(FELIPE)}
select 'como_authenticated|' || count(*) from retail.fn_planilla_salidas_por_registrar();
reset role;
select 'tabla_cerrada|' || has_table_privilege('authenticated', 'retail.planilla_salidas', 'select');
`);
  verificar("quién lo ve", r, {
    lider_con_dynamic: "1",
    lider_sin_dynamic: "0",
    colaboradora: "0",
    como_authenticated: "1",
    tabla_cerrada: "false",
  });

  // Sin las tablas de Dynamic (la base local pura): vacío, sin error.
  const sin = correr(`
begin;
drop table if exists public.periodos_planilla, public.periodo_grupo_pago, public.v_planilla_pagada cascade;
create or replace function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select true $f$;
do $d$ begin
  if to_regclass('retail.planilla_por_sede') is null then execute 'create view retail.planilla_por_sede as select 1 as ensayo'; end if;
end $d$;
${MIGRACION}
${cambiaA(FELIPE)}
select 'sin_dynamic|' || count(*) from retail.fn_planilla_salidas_por_registrar();
`);
  verificar("sin Dynamic en la base", sin, { sin_dynamic: "0" });
}

// ---------- Escena 4: registrado, con otro monto, anulado; un tramo, una salida ----------
{
  const enlazar = (banco, mov) => `insert into retail.planilla_salidas (periodo_id, grupo, banco, movimiento_id) values ('${P1}', 'planilla', '${banco}', :'${mov}');\n`;
  const r = correr(`
begin;
${DYNAMIC}
${MIGRACION}
${PERSONAS(3, P1, "planilla", "BCP", 1000)}${PERSONAS(2, P1, "planilla", "Interbank", 500)}
${PAGADO(P1, "planilla", "2019-07-31 03:00:00+00")}
${cambiaA(FELIPE)}
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco de prueba', 'banco', '104') returning id as banco \\gset
select retail.registrar_movimiento_dinero('pago_planilla', 3000, :'banco', null, '2019-07-30', 'Planilla BCP') as m_bcp \\gset
select retail.registrar_movimiento_dinero('pago_planilla', 999, :'banco', null, '2019-07-30', 'Planilla Interbank') as m_ibk \\gset
${enlazar("bcp", "m_bcp")}${enlazar("interbank", "m_ibk")}
${LEER}
select 'cuenta_registrada|' || string_agg(distinct cuenta_nombre || ' ' || fecha_registrada, ',') from retail.fn_planilla_salidas_por_registrar();
-- Se corrige el de Interbank: anular y registrar el monto bueno, enlazado al mismo tramo.
select retail.anular_movimiento_dinero(:'m_ibk', 'Monto equivocado');
select retail.registrar_movimiento_dinero('pago_planilla', 1000, :'banco', null, '2019-07-30', 'Planilla Interbank') as m_ibk2 \\gset
update retail.planilla_salidas set movimiento_id = :'m_ibk2' where periodo_id = '${P1}' and grupo = 'planilla' and banco = 'interbank';
select 'todo_registrado|' || count(*) from retail.fn_planilla_salidas_por_registrar();
-- Se anula el de BCP: el tramo vuelve a pedir su salida.
select retail.anular_movimiento_dinero(:'m_bcp', 'Se registró en la cuenta equivocada');
select 'vuelve_bcp|' || coalesce(movimiento_id::text, 'sin') || ',' || personas from retail.fn_planilla_salidas_por_registrar() where banco = 'bcp';
select 'sigue_interbank|' || registrado from retail.fn_planilla_salidas_por_registrar() where banco = 'interbank';
-- Un tramo, una salida: un segundo enlace al mismo tramo se rechaza.
do $$
begin
  insert into retail.planilla_salidas (periodo_id, grupo, banco, movimiento_id)
  values ('${P1}', 'planilla', 'interbank', (select id from retail.movimientos_dinero where referencia = 'Planilla BCP'));
  raise exception 'tendría que haber fallado';
exception when unique_violation then null;
end $$;
select 'dos_enlaces|rechazado';
`);
  verificar("registrado, con otro monto y anulado", r, {
    bcp: "3,3000.00,3000.00",
    interbank: "2,1000.00,999.00",
    cuenta_registrada: "Banco de prueba 2019-07-30",
    todo_registrado: "0",
    vuelve_bcp: "sin,3",
    sigue_interbank: "1000.00",
    dos_enlaces: "rechazado",
  });
}

// ---------- Escena 5: se puede pegar dos veces ----------
{
  const r = correr(`
begin;
${DYNAMIC}
${MIGRACION}
${MIGRACION}
select 'dos_veces|' || (to_regclass('retail.planilla_salidas') is not null);
`);
  verificar("se puede pegar dos veces", r, { dos_veces: "true" });
}

// ---------- Escena 6: de qué cuenta sale cada banco ----------
{
  const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  -- Un código propio: si fuera P0001 (el de \`raise\` a secas) se confundiría con el rechazo esperado.
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX991';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;
  const r = correr(`
begin;
${MIGRACION}
${CUENTAS}
${cambiaA(FELIPE)}
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('BCP de prueba', 'banco', '104') returning id as bcp \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Interbank de prueba', 'banco', '104') returning id as ibk \\gset
select 'antes|' || string_agg(banco || ':' || coalesce(cuenta_nombre, '-'), ',' order by banco) from retail.fn_planilla_cuentas();
select count(*) as h0 from retail.configuracion_historial where que = 'planilla_cuenta' \\gset
select retail.guardar_cuenta_planilla('bcp', :'bcp');
select retail.guardar_cuenta_planilla('interbank', :'ibk');
select retail.guardar_cuenta_planilla('bcp', :'bcp');
select 'guardadas|' || string_agg(banco || ':' || coalesce(cuenta_nombre, '-'), ',' order by banco) from retail.fn_planilla_cuentas();
select 'historia|' || (count(*) - :h0) from retail.configuracion_historial where que = 'planilla_cuenta';
select 'firmada|' || (guardada_por = (select p.id from public.personas p where p.auth_user_id = '${FELIPE}')) from retail.planilla_cuentas where banco = 'bcp';
${debeFallar("caja_fuerte", "perform retail.guardar_cuenta_planilla('bcp', (select id from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null limit 1))", "P0001")}
${debeFallar("otro_banco", "perform retail.guardar_cuenta_planilla('bbva', null)", "P0001")}
${debeFallar("directo_no_banco", "update retail.planilla_cuentas set cuenta_id = (select id from retail.cuentas_dinero where tipo = 'caja_fuerte' limit 1) where banco = 'bcp'", "P0001")}
-- Archivada: deja de proponerse. Quitada: nula.
update retail.cuentas_dinero set archivada_en = now(), archivada_por = (select p.id from public.personas p where p.auth_user_id = '${FELIPE}') where id = :'ibk';
select 'archivada|' || coalesce(cuenta_nombre, '-') from retail.fn_planilla_cuentas() where banco = 'interbank';
${debeFallar("guardar_archivada", "perform retail.guardar_cuenta_planilla('interbank', (select id from retail.cuentas_dinero where nombre = 'Interbank de prueba'))", "P0001")}
select retail.guardar_cuenta_planilla('bcp', null);
select 'quitada|' || coalesce(cuenta_nombre, '-') from retail.fn_planilla_cuentas() where banco = 'bcp';
${cambiaA(MICAELA)}
${debeFallar("colaboradora", "perform retail.guardar_cuenta_planilla('bcp', null)", "42501")}
select 'colaboradora_lee|' || count(*) from retail.fn_planilla_cuentas();
`);
  verificar("de qué cuenta sale cada banco", r, {
    antes: "bcp:-,interbank:-",
    guardadas: "bcp:BCP de prueba,interbank:Interbank de prueba",
    historia: "2",
    firmada: "true",
    caja_fuerte: "ok",
    otro_banco: "ok",
    directo_no_banco: "ok",
    archivada: "-",
    guardar_archivada: "ok",
    quitada: "-",
    colaboradora: "ok",
    colaboradora_lee: "0",
  });
  const dos = correr(`
begin;
${MIGRACION}
${CUENTAS}
${CUENTAS}
select 'cuentas_dos_veces|' || (to_regclass('retail.planilla_cuentas') is not null);
`);
  verificar("la cuenta por banco se puede pegar dos veces", dos, { cuentas_dos_veces: "true" });
}

console.log(`\n${casos - fallos}/${casos} casos en verde`);
process.exit(fallos ? 1 : 0);
