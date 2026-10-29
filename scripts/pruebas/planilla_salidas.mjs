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
 *   5. Un grupo con todos sus tramos registrados deja de aparecer, aunque una salida sea de otro monto (lo que de verdad salió del banco);
 *      si Dynamic cambia el neto después de registrar, vuelve y dice cuánto decía; si su salida se anula, el tramo vuelve a pedirla.
 *   6. Un tramo no puede tener dos salidas enlazadas; la migración se puede pegar dos veces.
 *   7. De qué cuenta sale cada banco (20261029053000): solo un banco activo, solo el líder o Configuración, firma y deja historia, repetir
 *      lo mismo no escribe, una cuenta archivada deja de proponerse, y ni una escritura directa mete una cuenta que no es banco.
 *   8. Registrar las salidas de un grupo (20261029054000): crea un «Pago de la planilla» por banco con su referencia y la fecha de pago de
 *      Dynamic si no se da otra; reintentar con el mismo token no duplica; un tramo con salida no recibe otra; si un banco falla no queda
 *      ninguno; enlaza una registrada a mano (y nada que no sea un «Pago de la planilla» suelto); deshecha, se vuelve a registrar; un
 *      grupo sin pagar, una fecha antes del inicio, un monto cero, quien no es líder o no ve la planilla: rechazados sin escribir.
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
const REGISTRAR = readFileSync(join(RAIZ, "supabase", "migrations", "20261029054000_registrar_salidas_planilla.sql"), "utf8");

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
  const enlazar = (banco, mov, neto) =>
    `insert into retail.planilla_salidas (periodo_id, grupo, banco, movimiento_id, neto_dynamic) values ('${P1}', 'planilla', '${banco}', :'${mov}', ${neto});\n`;
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
${enlazar("bcp", "m_bcp", 3000)}${enlazar("interbank", "m_ibk", 1000)}
-- Interbank se registró por 999 cuando Dynamic decía 1000: es lo que salió del banco y no pide atención.
select 'todo_registrado|' || count(*) from retail.fn_planilla_salidas_por_registrar();
-- Dynamic reabre y vuelve a pagar con otro neto para Interbank: el grupo vuelve, con lo que decía al registrar.
update public.v_planilla_pagada set total = 550 where persona_id in (select persona_id from public.datos_personales where entidad_bancaria = 'Interbank');
${LEER}
select 'antes_decia|' || neto_al_registrar from retail.fn_planilla_salidas_por_registrar() where banco = 'interbank';
select 'cuenta_registrada|' || string_agg(distinct cuenta_nombre || ' ' || fecha_registrada, ',') from retail.fn_planilla_salidas_por_registrar();
update public.v_planilla_pagada set total = 500 where persona_id in (select persona_id from public.datos_personales where entidad_bancaria = 'Interbank');
-- Se anula el de BCP: el tramo vuelve a pedir su salida.
select retail.anular_movimiento_dinero(:'m_bcp', 'Se registró en la cuenta equivocada');
select 'vuelve_bcp|' || coalesce(movimiento_id::text, 'sin') || ',' || personas from retail.fn_planilla_salidas_por_registrar() where banco = 'bcp';
select 'sigue_interbank|' || registrado from retail.fn_planilla_salidas_por_registrar() where banco = 'interbank';
-- Un tramo, una salida: un segundo enlace al mismo tramo se rechaza.
do $$
begin
  insert into retail.planilla_salidas (periodo_id, grupo, banco, movimiento_id, neto_dynamic)
  values ('${P1}', 'planilla', 'interbank', (select id from retail.movimientos_dinero where referencia = 'Planilla BCP'), 1000);
  raise exception 'tendría que haber fallado';
exception when unique_violation then null;
end $$;
select 'dos_enlaces|rechazado';
`);
  verificar("registrado, con otro monto y anulado", r, {
    todo_registrado: "0",
    bcp: "3,3000.00,3000.00",
    interbank: "2,1100.00,999.00",
    antes_decia: "1000",
    cuenta_registrada: "Banco de prueba 2019-07-30",
    vuelve_bcp: "sin,3",
    sigue_interbank: "999.00",
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
-- Lo que la base ya traiga guardado no cuenta: la escena parte de cero (se deshace con el ROLLBACK).
delete from retail.planilla_cuentas;
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

// ---------- Escena 7: registrar las salidas de un grupo ----------
{
  const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX991';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;
  const salidas = (lista) => `'${JSON.stringify(lista)}'::jsonb`;
  const T1 = "00000000-0000-4000-8000-0000000007a1";
  const T2 = "00000000-0000-4000-8000-0000000007a2";
  const T3 = "00000000-0000-4000-8000-0000000007a3";
  const T4 = "00000000-0000-4000-8000-0000000007a4";
  const contar = `(select count(*) from retail.movimientos_dinero where tipo = 'pago_planilla')`;
  const r = correr(`
begin;
${DYNAMIC}
${MIGRACION}
${CUENTAS}
${REGISTRAR}
-- Los enlaces que la base ya traiga no cuentan: la escena parte de cero (se deshace con el ROLLBACK).
delete from retail.planilla_salidas;
${PERSONAS(3, P1, "planilla", "BCP", 1000)}${PERSONAS(2, P1, "planilla", "Interbank", 500)}${PERSONAS(1, P1, "planilla", "Scotiabank", 300)}
${PAGADO(P1, "planilla", "2019-07-31 03:00:00+00")}
${PERSONAS(2, P1, "rxh", "BCP", 800)}
insert into public.periodo_grupo_pago values ('${P1}', 'rxh', 'abierto', null);
${cambiaA(FELIPE)}
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('BCP de prueba', 'banco', '104') returning id as bcp \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Interbank de prueba', 'banco', '104') returning id as ibk \\gset
select ${contar} as antes \\gset
-- Dos bancos de un toque; Interbank sin fecha toma la de pago de Dynamic (30/07 en Lima).
select jsonb_array_length(retail.registrar_salidas_planilla('${P1}', 'planilla',
  jsonb_build_array(jsonb_build_object('banco', 'bcp', 'cuenta_id', :'bcp', 'monto', 3000, 'fecha', '2019-08-01'),
                    jsonb_build_object('banco', 'interbank', 'cuenta_id', :'ibk', 'monto', 999)), '${T1}')) as hechas \\gset
select 'hechas|' || :hechas || ',' || (${contar} - :antes);
select 'interbank_mov|' || m.monto || ',' || m.fecha || ',' || m.referencia from retail.planilla_salidas s join retail.movimientos_dinero m on m.id = s.movimiento_id where s.banco = 'interbank';
select 'neto_guardado|' || string_agg(banco || ':' || neto_dynamic, ',' order by banco) from retail.planilla_salidas;
select 'falta_solo|' || string_agg(banco || ':' || coalesce(movimiento_id::text, 'sin'), ',' order by banco) from retail.fn_planilla_salidas_por_registrar() where movimiento_id is null;
-- El mismo token otra vez: devuelve lo mismo y no escribe.
select retail.registrar_salidas_planilla('${P1}', 'planilla',
  jsonb_build_array(jsonb_build_object('banco', 'bcp', 'cuenta_id', :'bcp', 'monto', 3000, 'fecha', '2019-08-01'),
                    jsonb_build_object('banco', 'interbank', 'cuenta_id', :'ibk', 'monto', 999)), '${T1}');
select 'reintento|' || (${contar} - :antes);
-- Otra hoja para un tramo con salida: rechazada. Y si un banco falla, no queda ninguno (sin_banco no se crea).
${debeFallar("bcp_otra_vez", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', ${salidas([{ banco: "bcp", cuenta_id: null, monto: 1 }])}, '${T2}')`, "P0001")}
${debeFallar("todo_o_nada", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'sin_banco', 'cuenta_id', (select id from retail.cuentas_dinero where nombre = 'BCP de prueba'), 'monto', 300), jsonb_build_object('banco', 'bcp', 'cuenta_id', (select id from retail.cuentas_dinero where nombre = 'BCP de prueba'), 'monto', 3000)), '${T2}')`, "P0001")}
select 'sin_rastro|' || (${contar} - :antes);
-- Enlazar una registrada a mano.
select retail.registrar_movimiento_dinero('pago_planilla', 300, :'bcp', null, '2019-07-30', 'Planilla a mano') as manual \\gset
select 'suelta|' || count(*) from retail.fn_planilla_salidas_sueltas() where movimiento_id = :'manual';
-- Un movimiento que no es «Pago de la planilla» (un traspaso entre bancos) no se enlaza.
select retail.registrar_movimiento_dinero('entre_cuentas', 10, :'bcp', :'ibk', '2019-07-30', 'Traspaso de prueba') as traspaso \\gset
${debeFallar("enlazar_no_planilla", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'sin_banco', 'movimiento_id', (select id from retail.movimientos_dinero where referencia = 'Traspaso de prueba'))), '${T3}')`, "P0001")}
select retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'sin_banco', 'movimiento_id', :'manual')), '${T3}');
select 'enlazada|' || (select count(*) from retail.fn_planilla_salidas_sueltas() where movimiento_id = :'manual') || ',' || (select count(*) from retail.fn_planilla_salidas_por_registrar());
-- Deshecha la de BCP, el tramo vuelve y se registra de nuevo con otra hoja.
select retail.anular_movimiento_dinero((select movimiento_id from retail.planilla_salidas where banco = 'bcp'), 'Cuenta equivocada');
select 'vuelve|' || count(*) from retail.fn_planilla_salidas_por_registrar() where banco = 'bcp' and movimiento_id is null;
select retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'bcp', 'cuenta_id', :'ibk', 'monto', 3000)), '${T4}');
select 'rehecha|' || c.nombre || ',' || (select count(*) from retail.fn_planilla_salidas_por_registrar())
  from retail.planilla_salidas s join retail.movimientos_dinero m on m.id = s.movimiento_id join retail.cuentas_dinero c on c.id = m.cuenta_origen_id where s.banco = 'bcp';
-- Lo que se rechaza sin escribir.
select ${contar} as antes2 \\gset
${debeFallar("sin_pagar", `perform retail.registrar_salidas_planilla('${P1}', 'rxh', ${salidas([{ banco: "bcp", cuenta_id: null, monto: 1600 }])}, gen_random_uuid())`, "P0001")}
${debeFallar("banco_repetido", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', ${salidas([{ banco: "bcp" }, { banco: "bcp" }])}, gen_random_uuid())`, "P0001")}
${debeFallar("banco_raro", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', ${salidas([{ banco: "bbva" }])}, gen_random_uuid())`, "P0001")}
update retail.parametros_finanzas set inicio_finanzas = '2019-07-01' where id;
delete from retail.planilla_salidas where banco = 'interbank';
${debeFallar("antes_del_inicio", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'interbank', 'cuenta_id', (select id from retail.cuentas_dinero where nombre = 'Interbank de prueba'), 'monto', 1000, 'fecha', '2019-06-15')), gen_random_uuid())`, "P0001")}
${debeFallar("monto_cero", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', jsonb_build_array(jsonb_build_object('banco', 'interbank', 'cuenta_id', (select id from retail.cuentas_dinero where nombre = 'Interbank de prueba'), 'monto', 0)), gen_random_uuid())`, "P0001")}
set local prueba.dynamic_admin = 'no';
${debeFallar("sin_ver_dynamic", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', ${salidas([{ banco: "interbank" }])}, gen_random_uuid())`, "42501")}
set local prueba.dynamic_admin = 'si';
${cambiaA(MICAELA)}
${debeFallar("colaboradora", `perform retail.registrar_salidas_planilla('${P1}', 'planilla', ${salidas([{ banco: "interbank" }])}, gen_random_uuid())`, "42501")}
select 'colaboradora_sueltas|' || count(*) from retail.fn_planilla_salidas_sueltas();
select 'nada_escrito|' || (${contar} - :antes2);
`);
  verificar("registrar las salidas de un grupo", r, {
    hechas: "2,2",
    interbank_mov: "999.00,2019-07-30,Planilla del 29/06 al 28/07 · quienes cobran en Interbank",
    neto_guardado: "bcp:3000.00,interbank:1000.00",
    falta_solo: "sin_banco:sin",
    reintento: "2",
    bcp_otra_vez: "ok",
    todo_o_nada: "ok",
    sin_rastro: "2",
    suelta: "1",
    enlazar_no_planilla: "ok",
    enlazada: "0,0",
    vuelve: "1",
    rehecha: "Interbank de prueba,0",
    sin_pagar: "ok",
    banco_repetido: "ok",
    banco_raro: "ok",
    antes_del_inicio: "ok",
    monto_cero: "ok",
    sin_ver_dynamic: "ok",
    colaboradora: "ok",
    colaboradora_sueltas: "0",
    nada_escrito: "0",
  });
  const dos = correr(`
begin;
${MIGRACION}
${CUENTAS}
${REGISTRAR}
${REGISTRAR}
select 'registrar_dos_veces|' || (to_regprocedure('retail.registrar_salidas_planilla(uuid, text, jsonb, uuid)') is not null);
`);
  verificar("registrar se puede pegar dos veces", dos, { registrar_dos_veces: "true" });
}

console.log(`\n${casos - fallos}/${casos} casos en verde`);
process.exit(fallos ? 1 : 0);
