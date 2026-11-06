#!/usr/bin/env node
/**
 * Prueba de la tarea 18 de «Las 36 de Finanzas» — el cierre de mes en orden, la planilla impaga y reabrir el último
 * (`20261106022000_cierre_en_orden_y_planilla_impaga.sql`).
 *
 * QUÉ CUBRE
 *   · ORDEN: un mes no se cierra si el anterior (de esa unidad, con asientos, desde el inicio de Finanzas) sigue abierto; con el anterior cerrado, sí.
 *   · REABRIR: solo el último mes cerrado; con uno posterior cerrado, rechaza; reabriendo de atrás hacia adelante se puede.
 *   · PLANILLA IMPAGA: con Dynamic, el chequeo `planilla` BLOQUEA mientras el mes no tenga su planilla pagada, y el mensaje dice que Dynamic la marque.
 *   · SALTARLA: solo un Admin, con motivo; queda en los avisos del cierre con su motivo. Poner la variable de la transacción a mano NO salta nada
 *     si quien cierra no es Admin. Con la planilla pagada, cierra normal.
 *   · PEGAR DOS VECES no cambia ninguna de las tres funciones.
 *
 * CÓMO. Cada escena corre en UNA transacción con ROLLBACK; meses de MARZO y ABRIL de 2025 (ya terminaron y nadie tiene datos). El inicio de Finanzas se
 * mueve a marzo de 2025 dentro de la transacción. La planilla de Dynamic y la puerta de Admin son de ensayo (como en estado_resultados.mjs).
 *
 * USO
 *   pnpm pruebas:cierre-orden-y-planilla
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
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261106022000_cierre_en_orden_y_planilla_impaga.sql"), "utf8");

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
function verificar(titulo, r) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  for (const linea of r.salida.split("\n").filter((l) => l.includes("|"))) {
    const i = linea.lastIndexOf("|");
    const caso = linea.slice(0, i);
    esperar(`${titulo}: ${caso}`, linea.slice(i + 1) === "true", linea);
  }
}

const AYUDANTES = `
set local request.jwt.claim.sub = '${FELIPE}';
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
-- Finanzas empieza en marzo de 2025 (solo dentro de esta transacción): febrero no cuenta como «mes anterior sin cerrar».
update retail.parametros_finanzas set inicio_finanzas = '2025-03-01' where id;
${MIGRACION}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
-- Una venta en marzo y otra en abril: TRU tiene asientos los dos meses.
insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tru', 'completada', '2025-03-10 12:00-05') returning id as v1 \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario) values (:'v1', :'va', 1, 100, 0, 40);
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v1', 'efectivo', 100);
insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tru', 'completada', '2025-04-10 12:00-05') returning id as v2 \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario) values (:'v2', :'va', 1, 100, 0, 40);
insert into retail.venta_pagos (venta_id, metodo, monto) values (:'v2', 'efectivo', 100);
`;

// ---------- Escena 1: el orden y reabrir el último ----------
verificar("orden", correr(`
begin;
${AYUDANTES}
select 'abril no se cierra con marzo abierto, y dice cuál falta|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-04-01', :'tru')) = 'Primero cierra marzo de 2025: los meses se cierran en orden.');
select 'marzo sí: febrero es anterior al inicio de Finanzas|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) = 'SIN_ERROR');
select 'con marzo cerrado, abril sí|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-04-01', :'tru')) = 'SIN_ERROR');
select 'marzo no se reabre con abril cerrado|' || (pg_temp.intento(format('select retail.reabrir_periodo(%L, ''ubicacion'', %L, ''me equivoqué'')', '2025-03-01', :'tru')) = 'Primero reabre el mes siguiente: solo se reabre el último mes cerrado.');
select 'abril sí se reabre (es el último)|' || (pg_temp.intento(format('select retail.reabrir_periodo(%L, ''ubicacion'', %L, ''me equivoqué'')', '2025-04-01', :'tru')) = 'SIN_ERROR');
select 'y después marzo también|' || (pg_temp.intento(format('select retail.reabrir_periodo(%L, ''ubicacion'', %L, ''me equivoqué'')', '2025-03-01', :'tru')) = 'SIN_ERROR');
select 'reabierto, abril vuelve a pedir marzo|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-04-01', :'tru')) like 'Primero cierra marzo%');
`));

// ---------- Escena 2: la planilla impaga y saltarla ----------
const PLANILLA = `
create or replace function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select true $f$;
create or replace function retail.fn_es_admin() returns boolean language sql stable as $f$
  select coalesce(current_setting('prueba.admin', true), 'no') = 'si'
$f$;
create table retail.zz_planilla_prueba (sede_codigo text, sede_tipo text, periodo_id uuid, fecha_ini date, fecha_fin date, personas bigint, pagado numeric, provisiones numeric, costo_total numeric);
create view retail.planilla_por_sede as select * from retail.zz_planilla_prueba;
-- Solo el período de febrero está pagado: TRU «tuvo planilla en los últimos meses», pero marzo todavía no tiene la suya.
insert into retail.zz_planilla_prueba values ('TRU', 'tienda', 'f5f5f5f5-0000-4000-8000-0000000000c1', '2025-01-29', '2025-02-28', 12, 10000, 2000, 12000);
`;
verificar("planilla", correr(`
begin;
${AYUDANTES}
${PLANILLA}
select 'el chequeo planilla bloquea cuando el mes no tiene su planilla pagada|' || (select (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean
  from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x where e.ubicacion_id = :'tru' and x ->> 'clave' = 'planilla');
select 'cerrar dice que Dynamic marque pagada la planilla|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) like '%que Dynamic marque pagada la planilla de ese mes%');

-- Quien no es Admin no salta nada, ni con la función ni poniendo la variable a mano.
select 'saltar sin ser Admin se rechaza|' || (pg_temp.intento(format('select retail.cerrar_periodo_saltando_planilla(%L, ''ubicacion'', %L, ''lo necesito ya'')', '2025-03-01', :'tru')) = 'Cerrar sin la planilla pagada es solo del Admin.');
select set_config('retail.cierre_salta_planilla', 'lo necesito ya', true);
select 'la variable puesta a mano no basta si no eres Admin|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) like '%que Dynamic marque pagada la planilla%');
select set_config('retail.cierre_salta_planilla', '', true);

-- Admin: pide motivo, y si lo da, cierra y deja el aviso.
set local prueba.admin = 'si';
select 'el Admin sin motivo no salta|' || (pg_temp.intento(format('select retail.cerrar_periodo_saltando_planilla(%L, ''ubicacion'', %L, ''  '')', '2025-03-01', :'tru')) like 'Di por qué se cierra sin la planilla pagada%');
select 'el Admin sin la función nueva sigue bloqueado (cerrar_periodo a secas)|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) like '%que Dynamic marque pagada la planilla%');
select 'el Admin con motivo cierra|' || (pg_temp.intento(format('select retail.cerrar_periodo_saltando_planilla(%L, ''ubicacion'', %L, ''Dynamic paga el lunes'')', '2025-03-01', :'tru')) = 'SIN_ERROR');
select 'el cierre guarda el aviso de la planilla con su motivo|' || (select exists (
  select 1 from retail.periodo_cierres c, jsonb_array_elements(c.avisos) a
   where c.mes = '2025-03-01' and c.ubicacion_id = :'tru' and a ->> 'clave' = 'planilla' and a ->> 'motivo' = 'Dynamic paga el lunes' and (a ->> 'saltada')::boolean));
select 'la variable no queda puesta para el siguiente cierre|' || (coalesce(current_setting('retail.cierre_salta_planilla', true), '') in ('', 'Dynamic paga el lunes'));
`));

// ---------- Escena 3: con la planilla pagada, cierra normal ----------
verificar("planilla pagada", correr(`
begin;
${AYUDANTES}
${PLANILLA}
insert into retail.zz_planilla_prueba values ('TRU', 'tienda', 'f5f5f5f5-0000-4000-8000-0000000000c2', '2025-02-28', '2025-03-28', 12, 10000, 2000, 12000);
select 'el chequeo planilla pasa|' || (select (x ->> 'ok')::boolean
  from retail.fn_cierre_mes_estado('2025-03-01') e, jsonb_array_elements(e.chequeos) x where e.ubicacion_id = :'tru' and x ->> 'clave' = 'planilla');
select 'cierra sin saltar nada|' || (pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '2025-03-01', :'tru')) = 'SIN_ERROR');
`));

// ---------- Escena 4: pegar dos veces no cambia nada ----------
verificar("idempotente", correr(`
begin;
${AYUDANTES}
select md5(pg_get_functiondef('retail.cerrar_periodo(date,text,uuid)'::regprocedure) || pg_get_functiondef('retail.reabrir_periodo(date,text,uuid,text)'::regprocedure)
        || pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) as huella_1 \\gset
${MIGRACION}
select 'misma huella|' || (md5(pg_get_functiondef('retail.cerrar_periodo(date,text,uuid)'::regprocedure) || pg_get_functiondef('retail.reabrir_periodo(date,text,uuid,text)'::regprocedure)
        || pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure)) = :'huella_1');
`));

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
