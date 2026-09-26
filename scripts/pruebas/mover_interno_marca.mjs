#!/usr/bin/env node
/**
 * Prueba de la marca de `mover_interno` (ADR-0208; `20260926200000_mover_interno_intentos_tabla.sql` y
 * `20260926200100_mover_interno_con_marca.sql`).
 *
 * QUÉ CUBRE
 *   M1 forma: UNA sola firma, con `p_token` opcional al final; authenticated la ejecuta y anon no; la tabla de marcas con
 *      RLS, sin políticas y sin privilegios de afuera.
 *   M2 sin marca: igual que antes (dos llamadas mueven dos veces), que es como la llama `bajar_al_piso`.
 *   M3 con marca: el reintento con los mismos datos devuelve el MISMO movimiento y no mueve nada más.
 *   M4 la misma marca con otra cantidad, otra nota u otro sentido: rechazo con hint `mover_interno_token_reusado`, sin mover.
 *   M5 la marca de un intento que falló (no alcanzaba) queda libre.
 *   M6 la marca se mira ANTES de pedir responsable: con la responsable ya fuera de turno, el reintento responde igual;
 *      una marca NUEVA con ella fuera de turno sigue rechazada.
 *   M7 la tabla no se edita, no se borra ni se vacía.
 *   M8 la guarda de la migración: si el cuerpo vivo de la firma vieja es otro, aborta sin tocar nada; pegada dos veces, igual.
 *   M9 `bajar_al_piso` (que llama a mover_interno con seis argumentos) sigue funcionando.
 *
 * CÓMO. Como `bajada_al_piso.mjs`: cada caso en su transacción con ROLLBACK, prendas NUEVAS por caso, sesión simulada con
 * `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. `pg_temp.mover` devuelve el resultado o el
 * error (estado, hint y mensaje) como JSON.
 *
 * USO
 *   pnpm pruebas:mover-interno-marca    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION_FUNCION = readFileSync(join(RAIZ, "supabase", "migrations", "20260926200100_mover_interno_con_marca.sql"), "utf8");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000e2"; // cuenta de una terminal administrativa de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000e3"; // integrante sin cuenta, marcó entrada
const LUZ = "33333333-3333-4333-8333-0000000000e4"; // integrante sin cuenta, NO marcó entrada

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const PRELUDIO = `
begin;
create function pg_temp.mover(p_u uuid, p_v uuid, p_n integer, p_o uuid, p_d uuid, p_nota text, p_token uuid) returns jsonb
language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  return jsonb_build_object('ok', true, 'id', retail.mover_interno(p_u, p_v, p_n, p_o, p_d, p_nota, p_token));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Marca Interna Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'MIM-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 2;
select id as va from retail.variantes where sku = 'MIM-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'MIM-PRUEBA-2' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'va', :'tru', :'alm', 'entrada', 10, 'prueba marca interna: colchón'), (:'vb', :'tru', :'alm', 'entrada', 10, 'prueba marca interna: colchón');
select count(*) as _c from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.variante_id in (:'va', :'vb') and m.tipo = 'entrada') x \\gset
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-marca-interna@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba marca interna)', 'administrativa', '${T_ALMACEN}');
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Marca', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Marca', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
\\set luz '${LUZ}'
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
`;

const sesion = (auth, resp = null) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', json_build_object(${resp ? `'x-responsable', :'${resp}', 'x-ubicacion', :'tru'` : ""})::text, true) as _h \\gset
set local role authenticated;
`;
const COMO_POSTGRES = "reset role;\n";
const mover = (n, tok, { v = "va", o = "alm", d = "piso", nota = "null" } = {}) =>
  `pg_temp.mover(:'tru', :'${v}', ${n}, :'${o}', :'${d}', ${nota}, ${tok})`;
const cant = (sub, v = "va") => `coalesce((select cantidad from retail.stock where variante_id = :'${v}' and ubicacion_id = :'tru' and sububicacion_id = :'${sub}'), 0)`;
const MOVS = `(select count(*) from retail.movimientos where variante_id in (:'va', :'vb') and tipo = 'traslado')`;
const INTENTOS = `(select count(*) from retail.movimientos_internos_intentos)`;

let fallos = 0;
let total = 0;
function caso(nombre, sql, verificar) {
  total++;
  let lineas;
  try {
    lineas = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n");
  } catch (e) {
    fallos++;
    console.log(`✗ ${nombre}\n    ${`${e.stderr ?? ""}${e.message ?? ""}`.slice(0, 1500)}`);
    return;
  }
  let ok = false;
  try {
    ok = typeof verificar === "string" ? lineas.at(-1) === verificar : !!verificar(lineas);
  } catch {
    ok = false;
  }
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) console.log(`    salió:\n    ${lineas.join("\n    ").slice(0, 1500)}`);
}
const json = (l) => JSON.parse(l);

caso(
  "M1 · una sola firma, con p_token opcional al final; authenticated la ejecuta y anon no",
  `select count(*) || '|' || string_agg(pg_get_function_arguments(oid), ';') from pg_proc
     where pronamespace = 'retail'::regnamespace and proname = 'mover_interno';
select concat_ws(',', has_function_privilege('authenticated', 'retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)', 'execute'),
  has_function_privilege('anon', 'retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)', 'execute'));`,
  (l) =>
    l.at(-2) ===
      "1|p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer, p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid, p_nota text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid" &&
    l.at(-1) === "t,f"
);
caso(
  "M1 · la tabla de marcas: RLS encendido, sin políticas y sin privilegios para anon ni authenticated",
  `select concat_ws(',', (select relrowsecurity from pg_class where oid = 'retail.movimientos_internos_intentos'::regclass),
  (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'movimientos_internos_intentos'),
  (select bool_or(has_table_privilege(r, 'retail.movimientos_internos_intentos', p)) from unnest(array['anon', 'authenticated']) r,
     unnest(array['select', 'insert', 'update', 'delete']) p));`,
  "t,0,f"
);
caso(
  "M2 · sin marca, igual que antes: dos llamadas mueven dos veces y no se anota nada",
  `${sesion(FELIPE)}select ${mover(2, "null")} as r1 \\gset
select ${mover(2, "null")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'ok', ${cant("piso")}, ${cant("alm")}, ${INTENTOS});`,
  "true,true,4,6,0"
);
caso(
  "M3 · con marca, el reintento con los mismos datos devuelve el MISMO movimiento y no mueve nada más",
  `${sesion(FELIPE)}select ${mover(3, ":'tok1'")} as r1 \\gset
select ${mover(3, ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'ok', (:'r1')::jsonb ->> 'id' = (:'r2')::jsonb ->> 'id',
  ${cant("piso")}, ${cant("alm")}, ${MOVS}, ${INTENTOS});`,
  "true,true,t,3,7,1,1"
);
caso(
  "M4 · la misma marca con otra cantidad, otra nota u otro sentido: rechazada, sin mover nada",
  `${sesion(FELIPE)}select ${mover(3, ":'tok1'")} as r1 \\gset
select ${mover(4, ":'tok1'")} as c \\gset
select ${mover(3, ":'tok1'", { nota: "'otra nota'" })} as n \\gset
select ${mover(3, ":'tok1'", { o: "piso", d: "alm" })} as s \\gset
${COMO_POSTGRES}select concat_ws(',', (:'c')::jsonb ->> 'hint', (:'n')::jsonb ->> 'hint', (:'s')::jsonb ->> 'hint',
  ${cant("piso")}, ${MOVS}, ${INTENTOS});`,
  "mover_interno_token_reusado,mover_interno_token_reusado,mover_interno_token_reusado,3,1,1"
);
caso(
  "M5 · la marca de un intento que falló (no alcanzaba) queda libre y sirve después",
  `${sesion(FELIPE)}select ${mover(99, ":'tok1'")} as r1 \\gset
select ${mover(2, ":'tok1'")} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'ok', ${cant("piso")}, ${INTENTOS});`,
  "false,true,2,1"
);
caso(
  "M6 · la marca se mira antes del responsable: con Rosa ya fuera de turno, el reintento responde el mismo movimiento",
  `${sesion(T_ALMACEN, "rosa")}select ${mover(2, ":'tok1'")} as r1 \\gset
${sesion(T_ALMACEN, "luz")}select ${mover(2, ":'tok1'")} as r2 \\gset
${sesion(T_ALMACEN)}select ${mover(2, ":'tok1'")} as r3 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'ok', (:'r2')::jsonb ->> 'id' = (:'r1')::jsonb ->> 'id',
  (:'r3')::jsonb ->> 'id' = (:'r1')::jsonb ->> 'id', ${cant("piso")}, ${MOVS},
  (select usuario_id = :'rosa' from retail.movimientos where id = ((:'r1')::jsonb ->> 'id')::uuid));`,
  "true,t,t,2,1,t"
);
caso(
  "M6 · una marca NUEVA con la responsable fuera de turno sigue rechazada (42501) y no mueve nada",
  `${sesion(T_ALMACEN, "luz")}select ${mover(2, ":'tok2'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'estado', (:'r')::jsonb ->> 'hint', ${cant("piso")}, ${INTENTOS});`,
  "42501,responsable_no_presente,0,0"
);
caso(
  "M7 · la tabla de marcas no se edita, no se borra ni se vacía",
  `${sesion(FELIPE)}select ${mover(1, ":'tok1'")} as r \\gset
${COMO_POSTGRES}select concat_ws(',',
  (pg_temp.intento('update retail.movimientos_internos_intentos set huella = md5(''x'')')) ->> 'ok',
  (pg_temp.intento('delete from retail.movimientos_internos_intentos')) ->> 'ok',
  (pg_temp.intento('truncate retail.movimientos_internos_intentos')) ->> 'ok',
  ${INTENTOS});`,
  "false,false,false,1"
);
caso(
  "M8 · la guarda: si el cuerpo vivo de la firma vieja es otro (un parche en vivo), la migración aborta sin tocar nada",
  `drop function retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid);
create function retail.mover_interno(p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer,
  p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid, p_nota text default null)
returns uuid language plpgsql as $f$ begin return null; /* parche en vivo desconocido */ end; $f$;
select pg_temp.intento(${"$"}m$${MIGRACION_FUNCION.replace(/\\/g, "\\\\")}${"$"}m$) as r \\gset
select concat_ws(',', (:'r')::jsonb ->> 'ok', position('cambió desde que se escribió' in (:'r')::jsonb ->> 'msg') > 0,
  (select string_agg(pg_get_function_identity_arguments(oid), ';') from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'mover_interno'));`,
  "false,t,p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer, p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid, p_nota text"
);
caso(
  "M8 · pegada dos veces sobre la base de hoy: sigue UNA sola firma y la marca funciona",
  `select pg_temp.intento(${"$"}m$${MIGRACION_FUNCION.replace(/\\/g, "\\\\")}${"$"}m$) ->> 'ok' as p1 \\gset
select pg_temp.intento(${"$"}m$${MIGRACION_FUNCION.replace(/\\/g, "\\\\")}${"$"}m$) ->> 'ok' as p2 \\gset
${sesion(FELIPE)}select ${mover(1, ":'tok1'")} as a \\gset
select ${mover(1, ":'tok1'")} as b \\gset
${COMO_POSTGRES}select concat_ws(',', :'p1', :'p2', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'mover_interno'),
  (:'a')::jsonb ->> 'id' = (:'b')::jsonb ->> 'id', ${cant("piso")});`,
  "true,true,1,t,1"
);
caso(
  "M9 · bajar_al_piso (que llama a mover_interno con seis argumentos) sigue bajando",
  `${sesion(FELIPE)}select retail.bajar_al_piso(:'tru', jsonb_build_array(jsonb_build_object('variante_id', :'vb', 'cantidad', 2)), gen_random_uuid()) ->> 'ya_registrada' as r \\gset
${COMO_POSTGRES}select concat_ws(',', :'r', ${cant("piso", "vb")}, ${cant("alm", "vb")});`,
  "false,2,8"
);

console.log(`\n${total - fallos}/${total} pruebas en verde.`);
process.exit(fallos ? 1 : 0);
