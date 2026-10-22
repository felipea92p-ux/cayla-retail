#!/usr/bin/env node
/**
 * Prueba de la provisión de planilla por sede — ADR-0453 (`20261018040000_planilla_provision_por_sede.sql` y, encima,
 * `20261022081000_planilla_provision_hoy_por_horario.sql` y `20261022164000_planilla_costo_real_con_cargas.sql`).
 *
 * QUÉ CUBRE
 *   · EL CÁLCULO: por sede, lo devengado hasta hoy (horas trabajadas; el sueldo fijo en proporción a los días corridos) y lo
 *     que costaría el período entero (horas al ritmo de lo trabajado, sueldo fijo completo, solo con 7 días corridos o más).
 *   · LA PRIVACIDAD: el grupo `prueba` no cuenta, una sede con menos de 3 personas no se devuelve, y la respuesta no trae
 *     nombre ni persona.
 *   · EL MAPEO: el taller de Dynamic es el Taller de retail (por su tipo); la central y la oficina son «de la empresa».
 *   · NUNCA DOS VECES: un período ya pagado no se estima (entra lo real por `planilla_por_sede`); lo cerrado se queda cerrado.
 *   · PRINCIPIO 9: sin ser admin o líder en Dynamic no devuelve nada; si Dynamic falla con UN período, los demás se devuelven.
 *   · PERMISOS: el mismo alcance que el Estado de resultados (`fn_ve_finanzas_de_todo()`, ADR-0433): el líder, o quien tiene «Cierre de
 *     mes», ve todas las sedes y «de la empresa»; con solo «Reportes financieros», la suya; sin él, nada; `anon` y `authenticated` no
 *     llaman a la función interna. Y ninguna de las dos pregunta `fn_es_lider()` por su cuenta (la regla A1 de `pruebas:finanzas-alcance`).
 *   · PEGAR DOS VECES no cambia las funciones.
 *   · EL COSTO REAL (ADR-0474, `20261022164000`): el costo de planilla es lo que recibe + la AFP y la renta de 4ª retenidas + las provisiones + el EsSalud
 *     del empleador. En un período abierto el EsSalud es el del MES entero y corre por días corridos (como un fijo); en lo ya pagado, la vista suma todo.
 *   · LO DE HOY (`20261022081000_planilla_provision_hoy_por_horario.sql`, act. 2026-10-22): `hoy_estimado`, lo que llevan hoy quienes están en
 *     su jornada = horas de hoy × la tasa por hora de su boleta + su movilidad del día. Sus tres candados: SIN FERIADO, SIN JORNADA RARA (doble
 *     entrada, retorno suelto, salida sin retorno, marca anulada, 22 horas, sin tasa, sueldo fijo, prueba, no entró hoy) y SE REEMPLAZA AL CERRAR
 *     (con salida final deja de contar). Y el principio 9: sin marcaciones, o con una columna que cambió, sale nulo y lo demás se devuelve igual.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK; fechas de 2030 para no cruzarse con datos reales. Dynamic se
 * simula con lo mínimo que la función necesita (`public.fn_es_admin_o_lider`, `public.periodos_planilla`, la vista puente y
 * `public.fn_proyeccion_periodo`, que devuelve las filas de una tabla de ensayo): el contrato real es el de Dynamic (probado a mano
 * contra producción, ver el ADR), aquí se prueba lo que retail hace con él.
 *
 * USO
 *   pnpm pruebas:planilla-provision
 *   node scripts/pruebas/planilla_provision.mjs --contenedor <otro>
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// La base ya tiene las dos migraciones de ADR-0453 aplicadas, en orden. La escena pega SOLO la última (la de lo de hoy: hace `drop function` de
// las dos funciones y las crea de nuevo) para que vean las tablas de ensayo. Pegar la primera encima ya no se puede: no puede cambiar el tipo de
// lo que devuelven, y está bien que falle (así un pegado equivocado en producción no borra en silencio la columna nueva).
const MIGRACION_HOY = readFileSync(join(RAIZ, "supabase", "migrations", "20261022081000_planilla_provision_hoy_por_horario.sql"), "utf8");
// La del costo real va ENCIMA de las dos: cambia la vista de lo pagado y el cuerpo de dos funciones (sin cambiar su forma).
const MIGRACION_COSTO = readFileSync(join(RAIZ, "supabase", "migrations", "20261022164000_planilla_costo_real_con_cargas.sql"), "utf8");

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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
/** Cada verificación de la escena sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
}
/** Saca los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// ---------------------------------------------------------------------------------------------------------------------------
// LA ESCENA. Período A: 29-sep-2030 → 28-oct-2030 (30 días), sin pagar. Período B: 29-ago → 28-sep, YA pagado. Período D: el
// siguiente (29-oct → 28-nov), sin pagar, que hace fallar a Dynamic. «Hoy» lo fija cada caso.
//   TRU (tienda, 3 por hora + 1 de prueba): 120 + 230 + 175 = 525
//   LIM (tienda, 2 por hora + 1 con sueldo fijo): horas 300 + 100 = 400, fijo 900
//   ZTAL (taller de Dynamic, 4 por hora de 100): 400            ZCCO (central, 3 de 50): 150            ZMIN (2 personas): se oculta
// A los 16 días corridos de 30: TRU devenga 525 y cerraría en 525 × 30 / 16 = 984.375; LIM devenga 400 + 900 × 16/30 = 880 y cerraría
// en 400 × 30/16 + 900 = 1,650.
// ---------------------------------------------------------------------------------------------------------------------------
const ESCENA = `
begin;
${cambiaA(FELIPE)}
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
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset

-- Dynamic, de ensayo: la puerta de admin o líder (se abre con prueba.planilla = 'si'), la vista puente (solo tiene que existir), el
-- calendario de períodos y la boleta en vivo, que sale de una tabla de ensayo. El período D hace fallar a Dynamic.
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$
  select coalesce(current_setting('prueba.planilla', true), 'no') = 'si'
$f$;
create view retail.planilla_por_sede as select null::text as sede_codigo where false;
create table public.periodos_planilla (id uuid primary key, fecha_ini date not null, fecha_fin date not null, estado text not null);
create table public.filas_de_ensayo (periodo_id uuid not null, sede text not null, tipo_vinculo text not null, sueldo_fijo boolean not null, total numeric not null, provision_total numeric not null,
  persona_id uuid, pago_base numeric, descuento_afp numeric, monto_movilidad numeric, horas_mes numeric, dias_trabajados numeric,
  retencion_4ta numeric, aporte_essalud numeric);
create table public.feriados_de_ensayo (periodo_id uuid not null, fecha date not null);
-- Las marcaciones de Dynamic (lo mínimo que lee lo de hoy): una fila por marca, el tipo como texto.
create table public.marcajes (persona_id uuid not null, tipo text not null, timestamp_marca timestamptz not null, fecha_jornada date, anulada_at timestamptz);
create function public.fn_proyeccion_periodo(p_periodo uuid) returns jsonb language plpgsql stable as $f$
begin
  if p_periodo = 'f0f0f0f0-0000-4000-8000-0000000000d1'::uuid then raise exception 'Dynamic de ensayo se cayó'; end if;
  return jsonb_build_object(
    'filas', coalesce((select jsonb_agg(jsonb_build_object('sede', sede, 'tipo_vinculo', tipo_vinculo, 'sueldo_fijo', sueldo_fijo, 'total', total, 'provision_total', provision_total,
                                                           'persona_id', persona_id, 'pago_base', pago_base, 'descuento_afp', descuento_afp, 'monto_movilidad', monto_movilidad,
                                                           'horas_mes', horas_mes, 'dias_trabajados', dias_trabajados, 'retencion_4ta', retencion_4ta, 'aporte_essalud', aporte_essalud))
                         from public.filas_de_ensayo where periodo_id = p_periodo), '[]'::jsonb),
    'feriados', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'nombre', 'Feriado de ensayo')) from public.feriados_de_ensayo where periodo_id = p_periodo), '[]'::jsonb));
end $f$;
insert into public.sedes (codigo, nombre, tipo) values ('ZTAL', 'Taller de ensayo', 'taller'), ('ZCCO', 'Central de ensayo', 'central'), ('ZMIN', 'Sede chica de ensayo', 'tienda');
insert into public.periodos_planilla (id, fecha_ini, fecha_fin, estado) values
  ('f0f0f0f0-0000-4000-8000-0000000000a1', '2030-09-29', '2030-10-28', 'abierto'),
  ('f0f0f0f0-0000-4000-8000-0000000000b1', '2030-08-29', '2030-09-28', 'pagado'),
  ('f0f0f0f0-0000-4000-8000-0000000000d1', '2030-10-29', '2030-11-28', 'abierto');
insert into public.filas_de_ensayo (periodo_id, sede, tipo_vinculo, sueldo_fijo, total, provision_total)
select 'f0f0f0f0-0000-4000-8000-0000000000a1'::uuid, x.sede, x.vinculo, x.fijo, x.total, x.prov from (values
  ('TRU',  'planilla', false, 100, 20), ('TRU', 'planilla', false, 200, 30), ('TRU', 'planilla', false, 150, 25), ('TRU', 'prueba', false, 9999, 999),
  ('LIM',  'planilla', false, 250, 50), ('LIM', 'planilla', false, 80, 20),  ('LIM', 'planilla', true, 800, 100),
  ('ZTAL', 'planilla', false, 80, 20),  ('ZTAL', 'planilla', false, 80, 20), ('ZTAL', 'planilla', false, 80, 20), ('ZTAL', 'rxh', false, 80, 20),
  ('ZCCO', 'planilla', false, 40, 10),  ('ZCCO', 'planilla', false, 40, 10), ('ZCCO', 'planilla', false, 40, 10),
  ('ZMIN', 'planilla', false, 500, 50), ('ZMIN', 'planilla', false, 500, 50)
) x (sede, vinculo, fijo, total, prov);
-- El período ya pagado trae filas: NO deben salir (para eso está la planilla real).
insert into public.filas_de_ensayo (periodo_id, sede, tipo_vinculo, sueldo_fijo, total, provision_total)
select 'f0f0f0f0-0000-4000-8000-0000000000b1'::uuid, 'TRU', 'planilla', false, 777, 77 from generate_series(1, 4);

${MIGRACION_HOY}
${MIGRACION_COSTO}
`;

// Todos los casos usan ESTE rango: el período A (termina el 28-oct) y el D (el 28-nov); el B ya está pagado y el C no existe.
const CALC = (hoy) => `create temp table pv as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '${hoy}');`;

const CASOS_CALCULO = `
select set_config('prueba.planilla', 'si', true);
${CALC("2030-10-14")}
select 'C1 TRU: 3 personas por hora, sin la fila de prueba; devenga 525 y cerraría en 984.38', (select personas = 3 and devengado = 525.00 and al_cierre = 984.38 and unidad = 'tienda' and ubicacion_id = :'tru' from pv where sede_codigo = 'TRU');
select 'C2 LIM: el sueldo fijo cuenta en proporción a los días (16 de 30): devenga 400 + 480 = 880', (select devengado = 880.00 and personas = 3 from pv where sede_codigo = 'LIM');
select 'C2 LIM al cierre: las horas al ritmo de lo trabajado y el fijo entero = 1,650', (select al_cierre = 1650.00 from pv where sede_codigo = 'LIM');
select 'C3 los días: 30 en el período, 16 corridos al 14-oct', (select bool_and(dias_periodo = 30 and dias_corridos = 16) from pv);
select 'C4 el taller de Dynamic es el Taller de retail, por su tipo', (select unidad = 'taller' and ubicacion_id = :'tal' and devengado = 400.00 and personas = 4 from pv where sede_codigo = 'ZTAL');
select 'C5 la central es «de la empresa»: sin ubicación', (select unidad = 'empresa' and ubicacion_id is null and devengado = 150.00 from pv where sede_codigo = 'ZCCO');
select 'C6 una sede con 2 personas no se devuelve (con 1 sola, el agregado sería su sueldo)', (select count(*) = 0 from pv where sede_codigo = 'ZMIN');
select 'C7 el período ya pagado no se estima: entra lo real', (select count(*) = 0 from pv where periodo_id = 'f0f0f0f0-0000-4000-8000-0000000000b1');
select 'C8 el período del mes siguiente (que hace fallar a Dynamic) se salta y los demás salen', (select count(*) = 4 and count(distinct periodo_id) = 1 from pv);
select 'C9 nunca una persona: la respuesta no trae nombre ni persona', (select pg_get_function_result('retail.fn_planilla_provision_calc(date, date, date, timestamptz)'::regprocedure) !~* '(nombre|persona_id|apellido|documento)');
select 'C9 ni la pública', (select pg_get_function_result('retail.fn_planilla_provision(date, date, uuid)'::regprocedure) !~* '(nombre|persona_id|apellido|documento)');
`;

// Con menos de 7 días corridos una semana rara decide el mes: no hay «al cierre». Antes de empezar, nada devengado. Pasado el fin, entero.
const CASOS_TIEMPO = `
select set_config('prueba.planilla', 'si', true);
create temp table pv5 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-10-31', '2030-10-03');
select 'T1 a los 5 días corridos devenga pero no proyecta el cierre', (select bool_and(dias_corridos = 5 and al_cierre is null) and count(*) = 4 and (select devengado from pv5 where sede_codigo = 'TRU') = 525.00 from pv5);
select 'T1 el fijo de LIM, a los 5 de 30 días: 400 + 150', (select devengado = 550.00 from pv5 where sede_codigo = 'LIM');
create temp table pv0 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-10-31', '2030-09-20');
select 'T2 antes de empezar el período, 0 días corridos y 0 devengado del fijo', (select bool_and(dias_corridos = 0 and al_cierre is null) and (select devengado from pv0 where sede_codigo = 'LIM') = 400.00 from pv0);
create temp table pvf as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-10-31', '2030-11-05');
select 'T3 pasado el fin, los días corridos son los del período y el devengado ya es el entero (hasta que Dynamic pague)', (select bool_and(dias_corridos = 30) and (select devengado from pvf where sede_codigo = 'LIM') = 1300.00 and (select al_cierre from pvf where sede_codigo = 'LIM') = 1300.00 from pvf);
select 'T4 un rango sin períodos abiertos no devuelve nada', (select count(*) = 0 from retail.fn_planilla_provision_calc('2030-01-01', '2030-01-31', '2030-10-14'));
select 'T5 un rango al revés se rechaza', (select pg_temp.intento($$select * from retail.fn_planilla_provision_calc('2030-10-31', '2030-10-01')$$) like '%rango%');
`;

const CASOS_CERRADO = `
select set_config('prueba.planilla', 'si', true);
-- Octubre cerrado para TRU y para «la empresa»: lo cerrado se queda cerrado, sin estimación; LIM y el Taller siguen abiertos.
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2030-10-01', 'ubicacion', :'tru', 'cerrado', gen_random_uuid());
insert into retail.periodos (mes, alcance, ubicacion_id, estado, cierre_id) values ('2030-10-01', 'empresa', null, 'cerrado', gen_random_uuid());
${CALC("2030-10-14")}
select 'K1 TRU con octubre cerrado no recibe estimación', (select count(*) = 0 from pv where sede_codigo = 'TRU');
select 'K1 ni «la empresa» cerrada', (select count(*) = 0 from pv where unidad = 'empresa');
select 'K1 LIM y el Taller, abiertos, siguen', (select count(*) = 2 and count(*) filter (where sede_codigo = 'LIM') = 1 and count(*) filter (where unidad = 'taller') = 1 from pv);
`;

const CASOS_SIN_DYNAMIC = `
select set_config('prueba.planilla', 'no', true);
select 'P1 quien no es admin o líder en Dynamic no ve nada (y no es un error)', (select count(*) = 0 from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14'));
select 'P1 la pública también devuelve vacío', (select count(*) = 0 from retail.fn_planilla_provision('2030-10-01', '2030-11-30'));
drop function public.fn_proyeccion_periodo(uuid);
select set_config('prueba.planilla', 'si', true);
select 'P2 sin la función de Dynamic en la base (local, CI) devuelve vacío, no un error', (select count(*) = 0 from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14'));
`;

const CASOS_PERMISOS = `
select set_config('prueba.planilla', 'si', true);
create temp table lid as select * from retail.fn_planilla_provision('2030-10-01', '2030-11-30');
select 'R1 el líder ve todas las sedes: tiendas, Taller y la empresa', (select count(*) = 4 and count(distinct unidad) = 3 from lid);
select 'R1 el líder puede pedir una sola sede', (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_planilla_provision('2030-10-01', '2030-11-30', :'tru'));
${cambiaA(MICAELA)}
select 'R2 sin el módulo, una colaboradora no ve la planilla estimada', (select pg_temp.intento($$select * from retail.fn_planilla_provision('2030-10-01', '2030-11-30')$$) like '%Reportes financieros%');
${conModulo("reportes_financieros")}
select 'R3 con el módulo ve SU sede y nada más: ni el Taller ni la empresa', (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_planilla_provision('2030-10-01', '2030-11-30'));
select 'R3 pedir otra sede falla', (select pg_temp.intento(format('select * from retail.fn_planilla_provision(%L, %L, %L)', '2030-10-01', '2030-11-30', :'lim')) like '%esa ubicación%');
-- La regla única de Finanzas (ADR-0433): quien cierra el mes ve «De la empresa» en el Estado de resultados, así que también su estimación.
${conModulo("cierre_mes")}
select 'R3b con «Cierre de mes» ve lo mismo que el líder: todas las sedes y «de la empresa», como el Estado de resultados', (select count(*) = 4 and count(distinct unidad) = 3 from retail.fn_planilla_provision('2030-10-01', '2030-11-30'));
select 'R3b y puede pedir una sola sede', (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_planilla_provision('2030-10-01', '2030-11-30', :'tru'));
select 'R3c ninguna de las dos funciones pregunta fn_es_lider() por su cuenta (la regla A1 de pruebas:finanzas-alcance)', (select count(*) = 0 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_planilla_provision', 'fn_planilla_provision_calc', 'fn_planilla_hoy_por_sede') and regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') ~ 'fn_es_lider\\s*\\(');
select 'R4 anon no puede llamar a ninguna', (select not has_function_privilege('anon', 'retail.fn_planilla_provision(date, date, uuid)', 'execute') and not has_function_privilege('anon', 'retail.fn_planilla_provision_calc(date, date, date, timestamptz)', 'execute'));
select 'R4 una sesión llama a la pública pero no a la interna', (select has_function_privilege('authenticated', 'retail.fn_planilla_provision(date, date, uuid)', 'execute') and not has_function_privilege('authenticated', 'retail.fn_planilla_provision_calc(date, date, date, timestamptz)', 'execute'));
`;

const CASOS_REPEGAR = `
select set_config('prueba.planilla', 'si', true);
create temp table antes as select p.proname, md5(pg_get_functiondef(p.oid)) as huella from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('fn_planilla_provision', 'fn_planilla_provision_calc', 'fn_planilla_hoy_por_sede');
${MIGRACION_COSTO}
select 'I1 pegar la migración del costo real otra vez deja las tres funciones idénticas', (select count(*) = 3 and bool_and(a.huella = md5(pg_get_functiondef(p.oid))) from antes a join pg_proc p on p.proname = a.proname join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'retail');
`;

// ---------------------------------------------------------------------------------------------------------------------------
// LO DE HOY (act. 2026-10-22). «Ahora» = 14-oct-2030 20:00 UTC = 15:00 en Lima. La tasa de la boleta de ensayo: por hora
// (pago_base 800 + provisión 100) / 100 horas = 9.00 (la AFP de 100 NO se resta: la base es el bruto, ADR-0474); por día presente: movilidad 160 / 10 días = 16.00.
//   p01 en horario desde las 09:00 Lima (6 h)            → 6 × 9 + 16 = 70.00
//   p02 con su almuerzo ya tomado (1 h de ausencia)      → 5 × 9 + 16 = 61.00
//   p03 en el almuerzo AHORA (cuenta hasta que salió, 5 h) → 61.00
//   las demás son jornadas que NO deben contar (ver cada caso).
// ---------------------------------------------------------------------------------------------------------------------------
const AHORA = "2030-10-14 20:00:00+00";
const ID = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MARCAS = `
insert into public.marcajes (persona_id, tipo, timestamp_marca, fecha_jornada, anulada_at) values
  ('${ID(1)}', 'entrada', '2030-10-14 14:00:00+00', null, null),
  ('${ID(2)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(2)}', 'salida_almuerzo', '2030-10-14 17:00:00+00', null, null), ('${ID(2)}', 'retorno_almuerzo', '2030-10-14 18:00:00+00', null, null),
  ('${ID(3)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(3)}', 'salida_almuerzo', '2030-10-14 19:00:00+00', null, null),
  ('${ID(4)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(4)}', 'salida_final', '2030-10-14 19:30:00+00', null, null),
  ('${ID(5)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(5)}', 'entrada', '2030-10-14 14:30:00+00', null, null),
  ('${ID(6)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(6)}', 'retorno_almuerzo', '2030-10-14 17:00:00+00', null, null),
  ('${ID(7)}', 'entrada', '2030-10-14 14:00:00+00', null, null), ('${ID(7)}', 'salida_almuerzo', '2030-10-14 17:00:00+00', null, null), ('${ID(7)}', 'salida_personal', '2030-10-14 18:00:00+00', null, null),
  ('${ID(8)}', 'entrada', '2030-10-13 22:00:00+00', '2030-10-14', null),
  ('${ID(9)}', 'entrada', '2030-10-14 14:00:00+00', null, '2030-10-14 15:00:00+00'),
  ('${ID(10)}', 'entrada', '2030-10-14 14:00:00+00', null, null),
  ('${ID(11)}', 'entrada', '2030-10-14 14:00:00+00', null, null),
  ('${ID(12)}', 'entrada', '2030-10-14 14:00:00+00', null, null),
  ('${ID(13)}', 'entrada', '2030-10-13 14:00:00+00', null, null),
  ('${ID(14)}', 'entrada', '2030-10-14 21:00:00+00', null, null);
`;
// La boleta de UNA persona con la tasa de ensayo (o de varias, si se pasan). `hoy_de` devuelve lo que se estima hoy en su sede.
const FUNCIONES_HOY = `
create function pg_temp.fila(p_id uuid, p_vinculo text default 'planilla', p_fijo boolean default false, p_horas_mes numeric default 100) returns jsonb language sql as $f$
  select jsonb_build_object('persona_id', p_id, 'sede', 'ZTAL', 'tipo_vinculo', p_vinculo, 'sueldo_fijo', p_fijo, 'pago_base', 800, 'descuento_afp', 100,
                            'provision_total', 100, 'monto_movilidad', 160, 'horas_mes', p_horas_mes, 'dias_trabajados', 10, 'total', 700)
$f$;
create function pg_temp.hoy_de(p_filas jsonb, p_feriados jsonb default '[]') returns numeric language sql as $f$
  select estimado from retail.fn_planilla_hoy_por_sede(jsonb_build_object('filas', p_filas, 'feriados', p_feriados), '2030-10-14', '${AHORA}')
$f$;
`;
const CASOS_HOY = `
select set_config('prueba.planilla', 'si', true);
${FUNCIONES_HOY}
${MARCAS}
select 'H1 en horario desde las 09:00: 6 h × 9 + 16 de movilidad = 70 (base bruta: la AFP no se resta)', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(1)}'))) = 70.00);
select 'H2 con su almuerzo ya tomado, la hora de ausencia no cuenta: 5 h → 61', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(2)}'))) = 61.00);
select 'H3 en el almuerzo ahora: cuenta hasta que salió (5 h) → 61', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(3)}'))) = 61.00);
select 'H4 SE REEMPLAZA AL CERRAR: con salida final ya no se estima (sus horas reales entran por Dynamic)', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(4)}'))) is null);
select 'H5 doble entrada: jornada rara, no cuenta', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(5)}'))) is null);
select 'H6 un retorno sin salida: jornada rara, no cuenta', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(6)}'))) is null);
select 'H7 una salida seguida de otra salida (sin retorno): jornada rara, no cuenta', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(7)}'))) is null);
select 'H8 una jornada de 22 horas se descarta (más de 14)', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(8)}'))) is null);
select 'H9 una marca anulada no existe: sin entrada, no cuenta', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(9)}'))) is null);
select 'H10 sin tasa (horas_mes = 0: empezó este período) no se estima', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(10)}', 'planilla', false, 0))) is null);
select 'H11 quien cobra sueldo fijo no entra (su sueldo ya corre por días)', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(11)}', 'planilla', true))) is null);
select 'H12 el grupo prueba no entra', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(12)}', 'prueba'))) is null);
select 'H13 quien solo marcó AYER no cuenta hoy', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(13)}'))) is null);
select 'H14 una entrada que todavía no pasó (a las 16:00 Lima, son las 15:00) no cuenta', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(14)}'))) is null);
select 'H15 CANDADO DE FERIADO: si hoy es feriado en la boleta, no se estima', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(1)}')), '[{"fecha": "2030-10-14", "nombre": "Feriado"}]'::jsonb) is null);
select 'H15b un feriado de OTRO día no lo apaga', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(1)}')), '[{"fecha": "2030-10-08", "nombre": "Feriado"}]'::jsonb) = 70.00);
select 'H16 varias personas de una sede se suman: 70 + 61 + 61 = 192', (select pg_temp.hoy_de(jsonb_build_array(pg_temp.fila('${ID(1)}'), pg_temp.fila('${ID(2)}'), pg_temp.fila('${ID(3)}'), pg_temp.fila('${ID(4)}'), pg_temp.fila('${ID(5)}'))) = 192.00);
select 'H17 solo importes y personas contadas por sede: nunca el nombre ni el id de una persona', (select pg_get_function_result('retail.fn_planilla_hoy_por_sede(jsonb, date, timestamptz)'::regprocedure) !~* '(nombre|persona_id|apellido|documento)');
`;

// La integración con la provisión: la boleta de ensayo del Taller (ZTAL) trae a p01..p04 con las tasas de arriba.
const PERSONAS_ZTAL = `
delete from public.filas_de_ensayo where periodo_id = 'f0f0f0f0-0000-4000-8000-0000000000a1' and sede = 'ZTAL';
insert into public.filas_de_ensayo (periodo_id, sede, tipo_vinculo, sueldo_fijo, total, provision_total, persona_id, pago_base, descuento_afp, monto_movilidad, horas_mes, dias_trabajados)
select 'f0f0f0f0-0000-4000-8000-0000000000a1'::uuid, 'ZTAL', 'planilla', false, 700, 100, ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 800, 100, 160, 100, 10 from generate_series(1, 4) n;
`;
const CALC_HOY = `create temp table ph as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14', '${AHORA}');`;
const CASOS_HOY_CALCULO = `
select set_config('prueba.planilla', 'si', true);
${PERSONAS_ZTAL}
${MARCAS}
${CALC_HOY}
select 'HC1 el Taller devuelve lo de hoy: p01 + p02 + p03 = 192 (p04 ya cerró)', (select hoy_estimado = 192.00 and unidad = 'taller' from ph where sede_codigo = 'ZTAL');
select 'HC2 el devengado y el cierre NO cambian por lo de hoy: va en su columna aparte (4 × 900 de costo real)', (select devengado = 3600.00 and personas = 4 from ph where sede_codigo = 'ZTAL');
select 'HC3 las sedes sin marcaciones de hoy salen con hoy_estimado nulo, no en cero', (select bool_and(hoy_estimado is null) and count(*) = 3 from ph where sede_codigo <> 'ZTAL');
-- SE REEMPLAZA AL CERRAR: p01 marca su salida final y lo de hoy baja de 192 a 122 (p02 + p03); el devengado sigue igual.
insert into public.marcajes values ('${ID(1)}', 'salida_final', '2030-10-14 19:45:00+00', null, null);
create temp table ph2 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14', '${AHORA}');
select 'HC4b y en la provisión completa también: lo de hoy queda en 122 (p02 + p03) y el devengado igual', (select hoy_estimado = 122.00 and devengado = 3600.00 from ph2 where sede_codigo = 'ZTAL');
insert into public.feriados_de_ensayo values ('f0f0f0f0-0000-4000-8000-0000000000a1', '2030-10-14');
create temp table ph3 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14', '${AHORA}');
select 'HC5 FERIADO: hoy no se estima para ninguna sede, y el devengado sigue igual', (select bool_and(hoy_estimado is null) and (select devengado from ph3 where sede_codigo = 'ZTAL') = 3600.00 from ph3);
delete from public.feriados_de_ensayo;
create temp table ph4 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-11-05', '2030-11-05 20:00:00+00');
select 'HC6 si hoy no cae dentro del período, no hay estimado de hoy', (select count(*) > 0 and bool_and(hoy_estimado is null) from ph4);
select 'HC7 la pública entrega la columna hoy_estimado', (select pg_get_function_result('retail.fn_planilla_provision(date, date, uuid)'::regprocedure) ~ 'hoy_estimado');
`;
const CASOS_HOY_FALLAS = `
select set_config('prueba.planilla', 'si', true);
${PERSONAS_ZTAL}
${MARCAS}
-- Principio 9: sin las marcaciones de Dynamic (local, CI), la provisión de siempre sale igual y lo de hoy, nulo.
drop table public.marcajes;
create temp table pf as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14', '${AHORA}');
select 'HF1 sin la tabla de marcaciones: 4 sedes con su devengado y lo de hoy nulo', (select count(*) = 4 and bool_and(hoy_estimado is null) and (select devengado from pf where sede_codigo = 'ZTAL') = 3600.00 from pf);
`;
const CASOS_HOY_COLUMNA = `
select set_config('prueba.planilla', 'si', true);
${PERSONAS_ZTAL}
${MARCAS}
-- Si Dynamic renombra una columna, lo de hoy falla: se avisa en el log y la provisión de siempre se devuelve igual.
alter table public.marcajes rename column anulada_at to anulada_cambiada;
create temp table pc as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14', '${AHORA}');
select 'HF2 con una columna cambiada: 4 sedes, devengado intacto y lo de hoy nulo (no un error)', (select count(*) = 4 and bool_and(hoy_estimado is null) and (select devengado from pc where sede_codigo = 'ZTAL') = 3600.00 from pc);
`;

// EL COSTO REAL (ADR-0474). La central (ZCCO) con 3 personas en el período A (30 días): dos por hora y una con sueldo fijo.
//   por hora (×2):  total 1000 + AFP 130 + renta 4ª 5 + provisión 100 = 1235 cada una (lo que recibe NO es el costo: la AFP y la renta son del bruto)
//   fija (×1):      total 800 + AFP 100 + provisión 50 = 950
//   EsSalud del empleador: 90 por persona = 270, del MES entero: corre por días corridos, como un fijo.
// A los 16 días corridos: horas 2470 + (950 + 270) × 16/30 = 2470 + 650.67 = 3,120.67; al cierre: 2470 × 30/16 + 1220 = 5,851.25.
const COSTO_REAL_ZCCO = `
delete from public.filas_de_ensayo where periodo_id = 'f0f0f0f0-0000-4000-8000-0000000000a1' and sede = 'ZCCO';
insert into public.filas_de_ensayo (periodo_id, sede, tipo_vinculo, sueldo_fijo, total, provision_total, descuento_afp, retencion_4ta, aporte_essalud) values
  ('f0f0f0f0-0000-4000-8000-0000000000a1', 'ZCCO', 'planilla', false, 1000, 100, 130, 5, 90),
  ('f0f0f0f0-0000-4000-8000-0000000000a1', 'ZCCO', 'planilla', false, 1000, 100, 130, 5, 90),
  ('f0f0f0f0-0000-4000-8000-0000000000a1', 'ZCCO', 'planilla', true, 800, 50, 100, 0, 90);
`;
const CASOS_COSTO_REAL = `
select set_config('prueba.planilla', 'si', true);
${COSTO_REAL_ZCCO}
create temp table pr16 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-10-14');
select 'CR1 el costo es lo que recibe + AFP + renta de 4ª + provisión, y el EsSalud corre por días: 2470 + 1220 × 16/30 = 3,120.67', (select devengado = 3120.67 and personas = 3 and unidad = 'empresa' from pr16 where sede_codigo = 'ZCCO');
select 'CR2 al cierre: las horas al ritmo de lo trabajado y el fijo y el EsSalud ENTEROS = 5,851.25', (select al_cierre = 5851.25 from pr16 where sede_codigo = 'ZCCO');
create temp table pr2 as select * from retail.fn_planilla_provision_calc('2030-10-01', '2030-11-30', '2030-09-30');
select 'CR3 el día 1 del período NO se cuenta el EsSalud del mes entero: a los 2 días corridos entran 270 × 2/30 = 18, no 270', (select devengado = 2551.33 from pr2 where sede_codigo = 'ZCCO');
select 'CR4 sin AFP, renta ni EsSalud en la boleta (una boleta vieja) el costo es el de siempre, total + provisión: las otras sedes no cambian', (select devengado = 525.00 and al_cierre = 984.38 from pr16 where sede_codigo = 'TRU');
select 'CR5 el costo real no depende de lo de hoy: sigue sin marcaciones y el devengado es el mismo', (select count(*) = 4 and bool_and(hoy_estimado is null) from pr16);
`;
// La vista de lo PAGADO. Se arma `v_planilla_pagada` de Dynamic con las columnas que la vista suma y se pega la migración del costo real.
const CASOS_VISTA = `
select set_config('prueba.planilla', 'si', true);
drop view retail.planilla_por_sede;
create table public.v_planilla_pagada (periodo_id uuid, persona_id uuid, sede_codigo text, grupo text, total numeric, provision_total numeric, costo_total numeric,
  descuento_pension numeric, retencion_4ta numeric, aporte_essalud numeric);
-- Período B (pagado), el Taller de ensayo con 3 personas (+ 1 de prueba que no cuenta): 100 + AFP 13 + renta 2 + EsSalud 9 + provisión 20 = 144 cada una.
insert into public.v_planilla_pagada select 'f0f0f0f0-0000-4000-8000-0000000000b1', gen_random_uuid(), 'ZTAL', 'planilla', 100, 20, 120, 13, 2, 9 from generate_series(1, 3);
insert into public.v_planilla_pagada select 'f0f0f0f0-0000-4000-8000-0000000000b1', gen_random_uuid(), 'ZTAL', 'prueba', 5000, 500, 5500, 600, 50, 450;
${MIGRACION_COSTO}
select 'V1 lo pagado: el costo total es el costo real = 3 × (100 + 13 + 2 + 9 + 20) = 432', (select costo_total = 432 from retail.planilla_por_sede where sede_codigo = 'ZTAL');
select 'V2 el neto (pagado) y las provisiones no cambian: 300 y 60', (select pagado = 300 and provisiones = 60 and personas = 3 from retail.planilla_por_sede where sede_codigo = 'ZTAL');
select 'V3 el grupo prueba sigue fuera', (select personas = 3 from retail.planilla_por_sede where sede_codigo = 'ZTAL');
select 'V4 la vista sigue siendo security_invoker y sin personas', (select reloptions::text like '%security_invoker=true%' from pg_class where oid = 'retail.planilla_por_sede'::regclass) and (select count(*) = 0 from information_schema.columns where table_schema = 'retail' and table_name = 'planilla_por_sede' and column_name in ('persona_id', 'nombre'));
select 'V5 anon no la lee y una sesión sí', (select not has_table_privilege('anon', 'retail.planilla_por_sede', 'select') and has_table_privilege('authenticated', 'retail.planilla_por_sede', 'select'));
`;
// Sin Dynamic (base local pura) la parte de la vista no hace nada y no falla: se prueba sin crear v_planilla_pagada.
const CASOS_VISTA_SIN_DYNAMIC = `
select set_config('prueba.planilla', 'si', true);
${MIGRACION_COSTO}
select 'V6 sin v_planilla_pagada la migración no falla y no toca la vista de ensayo', (select count(*) = 0 from retail.planilla_por_sede);
`;

verificar("El cálculo por sede", correr(`${ESCENA}${CASOS_CALCULO}`), casosDe(CASOS_CALCULO));
verificar("El tiempo corrido", correr(`${ESCENA}${CASOS_TIEMPO}`), casosDe(CASOS_TIEMPO));
verificar("Lo cerrado se queda cerrado", correr(`${ESCENA}${CASOS_CERRADO}`), casosDe(CASOS_CERRADO));
verificar("Sin Dynamic", correr(`${ESCENA}${CASOS_SIN_DYNAMIC}`), casosDe(CASOS_SIN_DYNAMIC));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));
verificar("Pegar dos veces", correr(`${ESCENA}${CASOS_REPEGAR}`), casosDe(CASOS_REPEGAR));
verificar("Lo de hoy: los tres candados, jornada por jornada", correr(`${ESCENA}${CASOS_HOY}`), casosDe(CASOS_HOY));
verificar("Lo de hoy dentro de la provisión", correr(`${ESCENA}${CASOS_HOY_CALCULO}`), casosDe(CASOS_HOY_CALCULO));
verificar("Lo de hoy sin las marcaciones de Dynamic", correr(`${ESCENA}${CASOS_HOY_FALLAS}`), casosDe(CASOS_HOY_FALLAS));
verificar("Lo de hoy con una columna de Dynamic cambiada", correr(`${ESCENA}${CASOS_HOY_COLUMNA}`), casosDe(CASOS_HOY_COLUMNA));

verificar("El costo real de lo provisionado", correr(`${ESCENA}${CASOS_COSTO_REAL}`), casosDe(CASOS_COSTO_REAL));
verificar("El costo real de lo pagado (la vista)", correr(`${ESCENA}${CASOS_VISTA}`), casosDe(CASOS_VISTA));
verificar("El costo real sin Dynamic", correr(`${ESCENA}${CASOS_VISTA_SIN_DYNAMIC}`), casosDe(CASOS_VISTA_SIN_DYNAMIC));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
