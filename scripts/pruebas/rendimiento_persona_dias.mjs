#!/usr/bin/env node
/**
 * Prueba de `20261104213000_rendimiento_persona_por_dia.sql` (ADR-0610): lo de cada persona, día por día.
 *
 * QUÉ CUBRE
 *   · una fila por persona y día, con ventas, soles, prendas y su meta de ese día (la de `fn_metas_por_dia`);
 *   · no cuenta las ventas de prueba, las anuladas, las de otra tienda ni las de otro día;
 *   · el día de Lima: una venta de las 23:30 no pasa al día siguiente;
 *   · la suma del día cuadra con `fn_rendimiento_serie`: una venta sin quien atendió sale con persona nula y no se pierde;
 *   · quien vendió y ya no está en el equipo sale con su nombre y sin meta; quien tiene meta y no vendió sale en 0;
 *   · las metas de todos suman la meta de la tienda;
 *   · quien no ve esa tienda recibe 42501; un rango roto o de más de 92 días, 22023; `anon` no puede ejecutarla;
 *   · suma solo lo de CAYLA (ADR-0560).
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK y la sesión simulada con `request.jwt.claim.sub`. Usa marzo de 2020, sin ventas reales.
 * Crea las tablas de horarios de Dynamic dentro de la transacción si la base local no las tiene.
 *
 * USO   pnpm pruebas:rendimiento-persona-dias    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

// Otro contenedor solo si se corre contra una pila local aparte (CAYLA_CONTENEDOR_DB).
const CONTENEDOR_LOCAL = process.env.CAYLA_CONTENEDOR_DB ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // Admin y líder: ve las tiendas de Rendimiento
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante sin el módulo Rendimiento
const A_AUTH = "66666666-6666-4666-8666-0000000000b1";
const X_AUTH = "66666666-6666-4666-8666-0000000000b2";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);

/**
 * Trujillo con meta de 1.000 por día. Ana y Micaela con horario de 8 h: 500 cada una, si nadie más del equipo de Trujillo tiene horario.
 * Equis vendió en Trujillo y no es del equipo: su fila no lleva meta.
 */
const MUNDO = `
${cambiaA(FELIPE)}
create table if not exists public.horarios_asignados (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, vigente_desde date not null, vigente_hasta date,
  hora_entrada time, hora_salida time, almuerzo_min_minutos integer, almuerzo_max_minutos integer, dias_laborables integer[],
  horas_semana_objetivo numeric, created_at timestamptz not null default now(), horario_por_dia jsonb);
create table if not exists public.turnos (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, hora_entrada time, hora_salida time,
  origen text, es_descanso boolean not null default false, created_at timestamptz not null default now(), creado_por uuid);
create table if not exists public.jornadas (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, sede_id uuid, estado text default 'cerrada');
delete from public.horarios_asignados;
delete from public.turnos;
delete from public.jornadas;

select id as trujillo, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as mic from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into auth.users (id, aud, role, email) values
  ('${A_AUTH}', 'authenticated', 'authenticated', 'dias-ana@prueba.local'),
  ('${X_AUTH}', 'authenticated', 'authenticated', 'dias-equis@prueba.local');
insert into public.personas (auth_user_id, nombres, apellidos, rol, estado, sede_base_id) values
  ('${A_AUTH}', 'Ana', 'Prueba', 'integrante', 'activo', :'sede_tru'),
  ('${X_AUTH}', 'Equis', 'Fuera', 'integrante', 'activo', :'sede_tru');
select id as pa from public.personas where auth_user_id = '${A_AUTH}' \\gset
select id as px from public.personas where auth_user_id = '${X_AUTH}' \\gset
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado, rol_id) values
  (:'pa', 'colaborador', :'trujillo', 'activo', retail.fn_rol_por_clave('integrante'));
insert into public.horarios_asignados (persona_id, vigente_desde, horario_por_dia)
select x.p, date '2000-01-01', (select jsonb_object_agg(d::text, jsonb_build_object('e', '09:00', 's', '17:00', 'r', 0)) from generate_series(0, 6) d)
  from (values (:'pa'::uuid), (:'mic'::uuid)) as x(p);
insert into retail.ubicacion_metas_dia (ubicacion_id, dia_semana, meta)
select :'trujillo'::uuid, g::smallint, 1000 from generate_series(0, 6) g
on conflict do nothing;
update retail.ubicacion_metas_dia set meta = 1000 where ubicacion_id = :'trujillo'::uuid;

create function pg_temp.venta(p_ubic uuid, p_asesora uuid, p_usuario uuid, p_estado text, p_prueba boolean, p_cuando timestamptz, p_cant int, p_precio numeric)
returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, estado, es_prueba, created_at, anulado_en, motivo_anulacion)
  values (p_ubic, p_asesora, p_usuario, p_estado, p_prueba, p_cuando,
          case when p_estado = 'anulada' then p_cuando end, case when p_estado = 'anulada' then 'prueba automatizada' end)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
end;
$f$;
select pg_temp.venta(:'trujillo', :'pa', :'pa', 'completada', false, timestamptz '2020-03-02 10:15-05', 2, 50);  -- Ana: 100, 2 prendas
select pg_temp.venta(:'trujillo', :'pa', :'pa', 'completada', false, timestamptz '2020-03-02 23:30-05', 1, 80);  -- Ana a las 23:30 de Lima: sigue siendo el 2
select pg_temp.venta(:'trujillo', :'px', :'px', 'completada', false, timestamptz '2020-03-02 11:00-05', 1, 40);  -- Equis, que no es del equipo
select pg_temp.venta(:'trujillo', null, :'pa', 'completada', false, timestamptz '2020-03-02 12:00-05', 1, 30);   -- sin quien atendió
select pg_temp.venta(:'trujillo', :'pa', :'pa', 'completada', true,  timestamptz '2020-03-02 10:20-05', 1, 999); -- de prueba: no cuenta
select pg_temp.venta(:'trujillo', :'pa', :'pa', 'anulada',    false, timestamptz '2020-03-02 10:25-05', 1, 555); -- anulada: no cuenta
select pg_temp.venta(:'lima', :'pa', :'pa', 'completada', false, timestamptz '2020-03-02 10:30-05', 1, 333);     -- otra tienda: no cuenta
select pg_temp.venta(:'trujillo', :'pa', :'pa', 'completada', false, timestamptz '2020-03-01 10:30-05', 1, 777); -- otro día: no cuenta en el 2
`;

const DIA = `retail.fn_rendimiento_persona_dias(:'trujillo', date '2020-03-02', date '2020-03-02')`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1400)}`);
  }
}

// 1. Ana: dos ventas de ese día, sus soles, sus prendas y su meta.
{
  const r = correr(`${MUNDO}select ventas || ':' || total || ':' || prendas || ':' || meta_dia || ':' || nombre from ${DIA} where persona_id = :'pa';`);
  esperar("Ana: 2 ventas, 180 soles, 3 prendas y su meta de 500; no cuenta prueba, anulada, otra tienda ni otro día", ultima(r) === "2:180.00:3:500:Ana P.", r);
}

// 2. Quien tiene meta y no vendió sale en 0.
{
  const r = correr(`${MUNDO}select ventas || ':' || total || ':' || prendas || ':' || meta_dia from ${DIA} where persona_id = :'mic';`);
  esperar("Micaela no vendió: sale con 0 y su meta de 500", ultima(r) === "0:0:0:500", r);
}

// 3. Quien no es del equipo y vendió: con nombre y sin meta.
{
  const r = correr(`${MUNDO}select nombre || ':' || total || ':' || (meta_dia is null) from ${DIA} where persona_id = :'px';`);
  esperar("Equis no es del equipo: sale con su nombre, sus soles y sin meta", ultima(r) === "Equis F.:40.00:true", r);
}

// 4. La venta sin quien atendió no se pierde.
{
  const r = correr(`${MUNDO}select count(*) || ':' || sum(total) || ':' || bool_and(nombre is null) from ${DIA} where persona_id is null;`);
  esperar("la venta sin quien atendió sale con persona nula, sin perderse", ultima(r) === "1:30.00:true", r);
}

// 5. Cuadra con la serie de la tienda.
{
  const r = correr(`${MUNDO}select (select sum(total)::text || '/' || sum(ventas) from ${DIA})
    || ' = ' || (select total::text || '/' || ventas from retail.fn_rendimiento_serie(:'trujillo', date '2020-03-02', date '2020-03-02'));`);
  const [a, b] = (ultima(r) ?? "").split(" = ");
  esperar("la suma del día cuadra con fn_rendimiento_serie (mismos soles y mismas ventas)", !!a && a === b && a === "250.00/4", r);
}

// 6. Las metas suman la de la tienda.
{
  const r = correr(`${MUNDO}select sum(meta_dia) from ${DIA};`);
  esperar("las metas de ese día suman los 1.000 de la tienda", ultima(r) === "1000", r);
}

// 7. Un mes entero: una fila por persona y día con meta, y la venta del otro día aparece en su día.
{
  const r = correr(`${MUNDO}select count(*) filter (where persona_id = :'mic') || ':' || (select total from retail.fn_rendimiento_persona_dias(:'trujillo', date '2020-03-01', date '2020-03-31') where persona_id = :'pa' and fecha = '2020-03-01')
    from retail.fn_rendimiento_persona_dias(:'trujillo', date '2020-03-01', date '2020-03-31');`);
  esperar("el mes trae los 31 días de Micaela, y la venta del 1 está en su día", ultima(r) === "31:777.00", r);
}

// 8. Permisos y rangos.
{
  const r = correr(`${MUNDO}${cambiaA(MICAELA)}select * from ${DIA};`);
  esperar("una integrante sin Rendimiento recibe 42501", !r.ok && /42501|No puedes ver el rendimiento/.test(r.mensaje), r);
  const r1 = correr(`${MUNDO}select * from retail.fn_rendimiento_persona_dias(:'trujillo', date '2020-03-05', date '2020-03-02');`);
  const r2 = correr(`${MUNDO}select * from retail.fn_rendimiento_persona_dias(:'trujillo', date '2020-01-01', date '2020-06-01');`);
  const r3 = correr(`${MUNDO}select * from retail.fn_rendimiento_persona_dias(:'trujillo', null, date '2020-03-02');`);
  esperar("un rango invertido, de más de 92 días o sin fecha da 22023", [r1, r2, r3].every((x) => !x.ok && /22023|rango de fechas/.test(x.mensaje)), [r1, r2, r3]);
  const p = correr(`select has_function_privilege('anon', 'retail.fn_rendimiento_persona_dias(uuid, date, date)', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_rendimiento_persona_dias(uuid, date, date)', 'execute');`);
  esperar("anon no puede ejecutarla; authenticated sí", ultima(p) === "false|true", p);
  const c = correr(`select position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_rendimiento_persona_dias(uuid, date, date)'::regprocedure)) > 0;`);
  esperar("suma solo lo de CAYLA (ADR-0560)", ultima(c) === "t", c);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
