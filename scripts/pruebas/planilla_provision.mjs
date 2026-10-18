#!/usr/bin/env node
/**
 * Prueba de la provisión de planilla por sede — ADR-0453 (`20261018040000_planilla_provision_por_sede.sql`).
 *
 * QUÉ CUBRE
 *   · EL CÁLCULO: por sede, lo devengado hasta hoy (horas trabajadas; el sueldo fijo en proporción a los días corridos) y lo
 *     que costaría el período entero (horas al ritmo de lo trabajado, sueldo fijo completo, solo con 7 días corridos o más).
 *   · LA PRIVACIDAD: el grupo `prueba` no cuenta, una sede con menos de 3 personas no se devuelve, y la respuesta no trae
 *     nombre ni persona.
 *   · EL MAPEO: el taller de Dynamic es el Taller de retail (por su tipo); la central y la oficina son «de la empresa».
 *   · NUNCA DOS VECES: un período ya pagado no se estima (entra lo real por `planilla_por_sede`); lo cerrado se queda cerrado.
 *   · PRINCIPIO 9: sin ser admin o líder en Dynamic no devuelve nada; si Dynamic falla con UN período, los demás se devuelven.
 *   · PERMISOS: el líder ve todas las sedes; con «Reportes financieros», la suya; sin él, nada; `anon` y `authenticated` no
 *     llaman a la función interna.
 *   · PEGAR DOS VECES no cambia las funciones.
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261018040000_planilla_provision_por_sede.sql"), "utf8");

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
create table public.filas_de_ensayo (periodo_id uuid not null, sede text not null, tipo_vinculo text not null, sueldo_fijo boolean not null, total numeric not null, provision_total numeric not null);
create function public.fn_proyeccion_periodo(p_periodo uuid) returns jsonb language plpgsql stable as $f$
begin
  if p_periodo = 'f0f0f0f0-0000-4000-8000-0000000000d1'::uuid then raise exception 'Dynamic de ensayo se cayó'; end if;
  return jsonb_build_object('filas', coalesce((select jsonb_agg(jsonb_build_object('sede', sede, 'tipo_vinculo', tipo_vinculo, 'sueldo_fijo', sueldo_fijo, 'total', total, 'provision_total', provision_total))
                                                from public.filas_de_ensayo where periodo_id = p_periodo), '[]'::jsonb));
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

${MIGRACION}
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
select 'C9 nunca una persona: la respuesta no trae nombre ni persona', (select pg_get_function_result('retail.fn_planilla_provision_calc(date, date, date)'::regprocedure) !~* '(nombre|persona_id|apellido|documento)');
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
select 'R4 anon no puede llamar a ninguna', (select not has_function_privilege('anon', 'retail.fn_planilla_provision(date, date, uuid)', 'execute') and not has_function_privilege('anon', 'retail.fn_planilla_provision_calc(date, date, date)', 'execute'));
select 'R4 una sesión llama a la pública pero no a la interna', (select has_function_privilege('authenticated', 'retail.fn_planilla_provision(date, date, uuid)', 'execute') and not has_function_privilege('authenticated', 'retail.fn_planilla_provision_calc(date, date, date)', 'execute'));
`;

const CASOS_REPEGAR = `
select set_config('prueba.planilla', 'si', true);
create temp table antes as select p.proname, md5(pg_get_functiondef(p.oid)) as huella from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname like 'fn_planilla_provision%';
${MIGRACION}
select 'I1 pegar la migración dos veces deja las funciones idénticas', (select count(*) = 2 and bool_and(a.huella = md5(pg_get_functiondef(p.oid))) from antes a join pg_proc p on p.proname = a.proname join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'retail');
`;

// ---------------------------------------------------------------------------------------------------------------------------
verificar("El cálculo por sede", correr(`${ESCENA}${CASOS_CALCULO}`), casosDe(CASOS_CALCULO));
verificar("El tiempo corrido", correr(`${ESCENA}${CASOS_TIEMPO}`), casosDe(CASOS_TIEMPO));
verificar("Lo cerrado se queda cerrado", correr(`${ESCENA}${CASOS_CERRADO}`), casosDe(CASOS_CERRADO));
verificar("Sin Dynamic", correr(`${ESCENA}${CASOS_SIN_DYNAMIC}`), casosDe(CASOS_SIN_DYNAMIC));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));
verificar("Pegar dos veces", correr(`${ESCENA}${CASOS_REPEGAR}`), casosDe(CASOS_REPEGAR));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
