#!/usr/bin/env node
/**
 * Observatorio, el Inicio del Admin (ADR-0322, migración 20261004010000).
 *
 * QUÉ PRUEBA, contra el Postgres local (todo termina en ROLLBACK, también la propia migración):
 *   · `fn_observatorio`: lo vendido hoy por tienda en `dias` es exactamente la suma de `hoy_ventas`; las ventas de prueba y
 *     las anuladas no cuentan; la del mismo día de la semana pasada llega en `semana_pasada`; hay una fila por tienda y día;
 *     la caja abierta trae desde qué minuto.
 *   · `fn_observatorio_tienda`: categorías, prendas y equipo de hoy suman lo vendido hoy en esa tienda; las horas pico son el
 *     promedio de 4 semanas (una venta de hace 7 días pesa ¼); una ubicación que no es tienda se rechaza.
 *   · Solo Admin: un líder que no es Admin recibe 42501; `anon` no las ejecuta.
 *
 * CÓMO. Como `cayla_global.mjs`: sesión simulada con `request.jwt.claims`. Las ventas se siembran con los disparadores
 * apagados (`session_replication_role = replica`) para no depender del stock: aquí se prueba la lectura, no la venta.
 *
 * USO
 *   pnpm pruebas:observatorio
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en Dynamic)
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRACION = readFileSync(path.join(raiz, "supabase/migrations/20261004010000_observatorio_inicio_del_admin.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

// Siembra: dos ventas de hoy en Trujillo (S/ 100 y S/ 50), una de hoy en Lima (S/ 80), una de prueba y una anulada
// (que no cuentan), y una de Trujillo hace 7 días (S/ 40). Fechas en hora de Lima, a las 11:00 y 15:30.
const PRELUDIO = `
begin;
${MIGRACION}
set local search_path = retail, public, extensions;
update public.personas set rol = 'admin' where auth_user_id = '${FELIPE_AUTH}';
set local session_replication_role = replica;
create temp table s as select
  (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
  (select id from retail.ubicaciones where nombre = 'Tienda Lima') as lim,
  (select id from retail.ubicaciones where tipo = 'taller' limit 1) as taller,
  (select id from retail.variantes order by id limit 1) as var,
  (select id from public.personas where auth_user_id = '${FELIPE_AUTH}') as felipe,
  ((now() at time zone 'America/Lima')::date) as hoy;
grant select on s to authenticated;
create temp table nuevas (id uuid, ubicacion uuid, cuando timestamptz, prueba boolean, estado text, monto numeric);
insert into nuevas select gen_random_uuid(), s.tru, (s.hoy + time '00:05')::timestamp at time zone 'America/Lima', false, 'completada', 100 from s;
insert into nuevas select gen_random_uuid(), s.tru, (s.hoy + time '00:10')::timestamp at time zone 'America/Lima', false, 'completada', 50 from s;
insert into nuevas select gen_random_uuid(), s.lim, (s.hoy + time '00:15')::timestamp at time zone 'America/Lima', false, 'completada', 80 from s;
insert into nuevas select gen_random_uuid(), s.tru, (s.hoy + time '00:20')::timestamp at time zone 'America/Lima', true, 'completada', 999 from s;
insert into nuevas select gen_random_uuid(), s.tru, (s.hoy + time '00:25')::timestamp at time zone 'America/Lima', false, 'anulada', 777 from s;
insert into nuevas select gen_random_uuid(), s.tru, ((s.hoy - 7) + time '00:05')::timestamp at time zone 'America/Lima', false, 'completada', 40 from s;
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, usuario_id, anulado_en, motivo_anulacion)
  select n.id, n.ubicacion, n.cuando, n.estado, n.prueba, s.felipe,
         case when n.estado = 'anulada' then n.cuando end, case when n.estado = 'anulada' then 'prueba' end
  from nuevas n, s;
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  select n.id, s.var, 1, n.monto, 0 from nuevas n, s;
set local session_replication_role = origin;
`;

let fallas = 0;
function revisar(nombre, ok, detalle = "") {
  console.log(`${ok ? "✓" : "✗"} ${nombre}${ok ? "" : `\n    ${detalle}`}`);
  if (!ok) fallas++;
}

function correr(sql) {
  try {
    return psql(`${PRELUDIO}${sql}\nrollback;\n`).trim();
  } catch (e) {
    return `ERROR ${e.stderr ?? e.message}`;
  }
}

// Lo de hoy (fuera de la madrugada: las ventas sembradas son de las 00:05–00:25, siempre «hoy» en Lima).
const r1 = correr(`${como(FELIPE_AUTH)}
with o as (select retail.fn_observatorio(60) as j), s2 as (select * from s)
select
  (select (d->>'s')::numeric from o, s2, jsonb_array_elements(o.j->'dias') d where d->>'u' = s2.tru::text and (d->>'f')::date = s2.hoy),
  (select coalesce(sum((v->>'s')::numeric), 0) from o, s2, jsonb_array_elements(o.j->'hoy_ventas') v where v->>'u' = s2.tru::text),
  (select (d->>'t')::int from o, s2, jsonb_array_elements(o.j->'dias') d where d->>'u' = s2.tru::text and (d->>'f')::date = s2.hoy),
  (select (d->>'s')::numeric from o, s2, jsonb_array_elements(o.j->'dias') d where d->>'u' = s2.lim::text and (d->>'f')::date = s2.hoy),
  (select coalesce(sum((v->>'s')::numeric), 0) from o, s2, jsonb_array_elements(o.j->'semana_pasada') v where v->>'u' = s2.tru::text),
  (select jsonb_array_length(o.j->'dias') = 60 * jsonb_array_length(o.j->'tiendas') from o),
  (select count(*) from o, jsonb_array_elements(o.j->'hoy_ventas') v where (v->>'s')::numeric in (999, 777));
`);
const [truHoy, truSumaVentas, truTickets, limHoy, truSemana, filasCompletas, intrusas] = r1.split("\n").pop().split("|");
revisar("Trujillo hoy suma S/ 150 sin la de prueba ni la anulada (las sembradas, más lo que ya hubiera hoy)", Number(truHoy) >= 150 && Number(truHoy) === Number(truSumaVentas), r1);
revisar("los tickets de hoy en Trujillo cuentan solo ventas completadas que no son de prueba", Number(truTickets) >= 2, r1);
revisar("Lima hoy tiene su venta de S/ 80", Number(limHoy) >= 80, r1);
revisar("la venta de hace 7 días llega en semana_pasada", Number(truSemana) >= 40, r1);
revisar("hay una fila por tienda y día (60 días)", filasCompletas === "t", r1);
revisar("ni la venta de prueba ni la anulada aparecen en hoy_ventas", intrusas === "0", r1);

const r2 = correr(`${como(FELIPE_AUTH)}
with o as (select retail.fn_observatorio_tienda((select tru from s)) as j)
select
  (select coalesce(sum((c->>'s')::numeric), 0) from o, jsonb_array_elements(o.j->'categorias'->'hoy') c),
  (select coalesce(sum((p->>'s')::numeric), 0) from o, jsonb_array_elements(o.j->'productos'->'hoy') p),
  (select coalesce(sum((e->>'s')::numeric), 0) from o, jsonb_array_elements(o.j->'equipo'->'hoy') e),
  (select (d->>'s')::numeric from o, jsonb_array_elements((select retail.fn_observatorio(60))->'dias') d, s where d->>'u' = s.tru::text and (d->>'f')::date = s.hoy),
  (select coalesce(sum((p->>'s')::numeric), 0) from o, jsonb_array_elements(o.j->'pico') p),
  (o.j->'quietas') is not null
from o;
`);
const [catHoy, prodHoy, eqHoy, ventasHoy, picoSuma, conQuietas] = r2.split("\n").pop().split("|");
revisar("categorías de hoy suman lo vendido hoy en la tienda", Number(catHoy) === Number(ventasHoy), r2);
revisar("las prendas de hoy suman lo vendido hoy (hay menos de 12 prendas distintas)", Number(prodHoy) === Number(ventasHoy), r2);
revisar("el equipo de hoy suma lo vendido hoy", Number(eqHoy) === Number(ventasHoy), r2);
revisar("las horas pico promedian 4 semanas: la venta de hace 7 días pesa S/ 10", Number(picoSuma) >= 10, r2);
revisar("trae las prendas quietas", conQuietas === "t", r2);

const r3 = correr(`${como(FELIPE_AUTH)}
select pg_temp_ok from (select 1 as pg_temp_ok) x;
do $$ begin perform retail.fn_observatorio_tienda((select taller from s)); raise exception 'NO_RECHAZO'; exception when sqlstate '22023' then raise notice 'RECHAZO'; end $$;
`);
revisar("una ubicación que no es tienda se rechaza (22023)", !r3.includes("NO_RECHAZO") && !r3.startsWith("ERROR"), r3);

const r4 = correr(`
update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE_AUTH}';
${como(FELIPE_AUTH)}
do $$ begin perform retail.fn_observatorio(60); raise exception 'NO_RECHAZO'; exception when sqlstate '42501' then null; end $$;
do $$ begin perform retail.fn_observatorio_tienda((select tru from s)); raise exception 'NO_RECHAZO'; exception when sqlstate '42501' then null; end $$;
select 'ok';
`);
revisar("un líder que no es Admin recibe 42501 en las dos", r4.endsWith("ok"), r4);

const r5 = correr(`
select has_function_privilege('anon', 'retail.fn_observatorio(integer)', 'execute'),
       has_function_privilege('anon', 'retail.fn_observatorio_tienda(uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_observatorio(integer)', 'execute');
`);
revisar("anon no las ejecuta; authenticated sí (y la función decide)", r5.split("\n").pop() === "f|f|t", r5);

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
