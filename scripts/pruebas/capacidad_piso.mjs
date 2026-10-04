#!/usr/bin/env node
/**
 * Pruebas de la capacidad del piso por sede (ADR-0329; ADR-0328, actividad 6; migración
 * `20261005103000_capacidad_del_piso_por_sede.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   · LA SIEMBRA. Con los nombres de producción («Tienda TRU», «Tienda AQP», «Tienda LIM») y con los de la base local
 *     («Tienda Trujillo», «Tienda Lima»): TRU 20 m² × 30 = 600 contada el 2026-09-30, AQP 60 × 30 = 1800 provisional, LIM 6 × 30
 *     = 180 provisional; el Taller, nada. Re-pegar la migración no pisa una capacidad que el líder ya cambió.
 *   · LA LECTURA. `fn_capacidad_piso` le da la capacidad a un líder, a una colaboradora y a una terminal (la puerta única de
 *     retail); a una cuenta de afuera le da 42501, nunca cero filas. Una sede sin capacidad (Taller) da cero filas. Por la vía
 *     de PostgREST (rol `authenticated`) funciona, y la tabla no se lee directo.
 *   · LA ESCRITURA. Solo el líder; firma la persona y deja el antes y el después en `configuracion_historial` (que también
 *     anota la Actividad); la versión sube; reenviar lo mismo devuelve `sin_cambios` sin escribir ni anotar; con una versión
 *     vieja y otros números, PT409 que dice cómo quedó; la primera vez se pide versión 0; valida rango, fecha y sede.
 *   · EL ESQUEMA. Ni por fuera de la función: capacidad que no es m² × densidad, m² o densidad fuera de rango, capacidad < 1,
 *     el Taller con capacidad, una versión fijada a mano.
 *
 * CÓMO. Mismo patrón que `terminales_leen_stock_de_la_red.mjs`: cada caso en su transacción con ROLLBACK (la base local la
 * comparten varias sesiones); terminales, cuentas y sedes de prueba se crean DENTRO del caso. La sesión se simula con
 * `request.jwt.claim.sub` (lo que PostgREST hace con cada petición).
 *
 * LA CARRERA. Dos líderes guardando a la vez no se puede ver con ROLLBACK: se probó aparte con dos `psql` que confirman
 * (el segundo espera el candado y recibe PT409). Ver el cuerpo del PR.
 *
 * USO
 *   pnpm pruebas:capacidad-piso                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:capacidad-piso --base otra     → contra otra base del mismo contenedor
 *   … --en-seco                                  → carga la migración dentro de cada caso (base sin ella)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261005103000_capacidad_del_piso_por_sede.sql"), "utf8");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Creados en cada caso.
const T_VENTAS_TRU = "33333333-3333-4333-8333-0000000000a1";
const AFUERA = "33333333-3333-4333-8333-0000000000d1"; // cuenta de Auth sin persona, sin colaborador, sin terminal

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Todo lo que un caso necesita, dentro de su transacción. Deja `:tru`, `:lim`, `:taller`, `:p_felipe`. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset

insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_TRU}', 'authenticated', 'authenticated', 't-ventas-tru@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'afuera@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_TRU}');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const COMO_POSTGRES = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
}

/** «m² × densidad = capacidad · provisional» de una sede, leído con la función. */
const leer = (sede) =>
  `select coalesce((select trim_scale(m2_sala) || 'x' || trim_scale(densidad) || '=' || capacidad || ',' || provisional
                      from retail.fn_capacidad_piso(:'${sede}')), 'sin_fila');`;
/** Llamada a la escritura dentro de `pg_temp.intento`, con su resultado (jsonb) o el error. */
const fijar = (sede, m2, densidad, contada, version) =>
  `select pg_temp.intento(format('select retail.fijar_capacidad_piso(%L, ${m2}, ${densidad}, ${contada === null ? "null" : `%L::date`}, ${version})', :'${sede}'${contada === null ? "" : `, '${contada}'`}));`;
const fijarDevuelve = (sede, m2, densidad, contada, version) =>
  `select retail.fijar_capacidad_piso(:'${sede}', ${m2}, ${densidad}, ${contada === null ? "null" : `'${contada}'::date`}, ${version})::text;`;

// ===========================================================================
// 1. LA SIEMBRA
// ===========================================================================

caso(
  "la siembra en la base local: Trujillo 20 × 30 = 600 contada, Lima 6 × 30 = 180 provisional",
  como(FELIPE) + leer("tru") + "\n" + leer("lim"),
  "20x30=600,false\n6x30=180,true"
);
caso(
  "la siembra no le da capacidad al Taller (no tiene piso de venta): cero filas, sin error",
  como(FELIPE) + leer("taller"),
  "sin_fila"
);
caso(
  "con los NOMBRES DE PRODUCCIÓN: TRU 600 contada el 2026-09-30, AQP 1800 provisional, LIM 180 provisional, el Taller nada",
  `update retail.ubicaciones set nombre = 'Tienda TRU' where id = :'tru';
   update retail.ubicaciones set nombre = 'Tienda LIM' where id = :'lim';
   insert into retail.ubicaciones (nombre, tipo, activo) values ('Tienda AQP', 'tienda', true);
   delete from retail.capacidad_piso;
   ${MIGRACION}
   select string_agg(u.nombre || ':' || c.capacidad || ':' || coalesce(c.contada_el::text, 'provisional'), ' ' order by u.nombre)
     from retail.capacidad_piso c join retail.ubicaciones u on u.id = c.ubicacion_id;`,
  "Tienda AQP:1800:provisional Tienda LIM:180:provisional Tienda TRU:600:2026-09-30"
);
caso(
  "re-pegar la migración no pisa una capacidad que el líder ya cambió (ni su versión)",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-10-01", 1) + COMO_POSTGRES + MIGRACION + "\n" + como(FELIPE) +
    `select trim_scale(m2_sala) || ',' || contada_el || ',' || version from retail.fn_capacidad_piso(:'tru');`,
  (s) => s.endsWith("22,2026-10-01,2")
);
caso(
  "la siembra no toca una tienda con otro nombre (una sede de prueba no recibe capacidad inventada)",
  `insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede de prueba', 'tienda', true);
   ${MIGRACION}
   select count(*) from retail.capacidad_piso c join retail.ubicaciones u on u.id = c.ubicacion_id where u.nombre = 'Sede de prueba';`,
  "0"
);

// ===========================================================================
// 2. LA LECTURA (la puerta única de retail)
// ===========================================================================

caso("el LÍDER lee la capacidad de su sede", como(FELIPE) + leer("tru"), "20x30=600,false");
caso("la COLABORADORA lee la capacidad (no es un dato sensible: no hay dinero ni personas)", como(MICAELA) + leer("lim"), "6x30=180,true");
caso("una TERMINAL de ventas lee la capacidad (ADR-0289: la puerta conoce a las terminales)", como(T_VENTAS_TRU) + leer("tru"), "20x30=600,false");
caso(
  "una cuenta de AFUERA recibe 42501, no cero filas (no puede parecer «esta sede no tiene capacidad»)",
  como(AFUERA) + `select split_part(pg_temp.intento(format('select * from retail.fn_capacidad_piso(%L)', :'tru')), '|', 1);`,
  "42501"
);
caso(
  "por la vía de PostgREST (rol authenticated) la colaboradora lee; la tabla directo, no (ni el líder)",
  como(MICAELA) + `set local role authenticated;\n` + leer("tru") + "\n" + como(FELIPE) +
    `select split_part(pg_temp.intento('select count(*) from retail.capacidad_piso'), '|', 1);`,
  "20x30=600,false\n42501"
);
caso(
  "la lectura devuelve la versión y la fecha del conteo (lo que la pantalla del Plan del piso va a necesitar)",
  como(FELIPE) + `select version || ',' || contada_el || '|' || (select coalesce(contada_el::text, 'null') from retail.fn_capacidad_piso(:'lim')) from retail.fn_capacidad_piso(:'tru');`,
  "1,2026-09-30|null"
);

// ===========================================================================
// 3. LA ESCRITURA
// ===========================================================================

caso(
  "la COLABORADORA no cambia la capacidad: 42501 y nada cambia",
  como(MICAELA) + `select split_part(${fijar("tru", 25, 30, null, 1).replace(/^select /, "").replace(/;$/, "")}, '|', 2);\n` + leer("tru"),
  "capacidad_solo_lider\n20x30=600,false"
);
caso(
  "el LÍDER cambia TRU a 22 m²: capacidad 660, versión 2, firma Felipe, el antes y el después en el historial",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" + leer("tru") + "\n" +
    `select (actualizado_por = :'p_felipe') || ',' || version from retail.capacidad_piso where ubicacion_id = :'tru';
     select (hecho_por = :'p_felipe') || ',' || (detalle #>> '{antes,capacidad}') || '->' || (detalle #>> '{despues,capacidad}')
       from retail.configuracion_historial where que = 'capacidad_piso' and detalle ->> 'ubicacion_id' = :'tru';`,
  '{"version": 2, "capacidad": 660, "provisional": false, "sin_cambios": false}\n22x30=660,false\ntrue,2\ntrue,600->660'
);
caso(
  "el cambio también queda en la Actividad (el disparador de configuracion_historial lo anota en «configuracion»)",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" +
    `select count(*) || ',' || min(modulo) || ',' || min(accion) from retail.actividad a
       join retail.configuracion_historial h on a.tabla = 'configuracion_historial' and a.registro_id = h.id::text
      where h.que = 'capacidad_piso';`,
  (s) => s.endsWith("\n1,configuracion,config_capacidad_piso")
);
caso(
  "REINTENTO del mismo guardado (se cortó la respuesta): sin_cambios, sin escribir ni anotar otra vez",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" +
    `select count(*) from retail.configuracion_historial where que = 'capacidad_piso';
     select version from retail.capacidad_piso where ubicacion_id = :'tru';`,
  (s) => s.endsWith('\n{"version": 2, "capacidad": 660, "provisional": false, "sin_cambios": true}\n1\n2')
);
caso(
  "DOS LÍDERES: el segundo, con la versión que leyó antes y otros números, recibe PT409 que dice cómo quedó; nada se pisa",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" + fijar("tru", 25, 30, null, 1) + "\n" + leer("tru"),
  (s) => {
    const [, error, quedo] = s.split("\n");
    return error.startsWith("PT409|version_cambiada|Otra persona cambió la capacidad de Tienda Trujillo") &&
      error.includes("ahora caben 660 prendas (22 m² × 30 por m²)") && quedo === "22x30=660,false";
  }
);
caso(
  "con la versión que devolvió el guardado anterior, se vuelve a guardar sin recargar",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" + fijarDevuelve("tru", 22, 33, "2026-09-30", 2),
  (s) => s.endsWith('\n{"version": 3, "capacidad": 726, "provisional": false, "sin_cambios": false}')
);
caso(
  "contar una sede provisional la vuelve «contada»; quitarle la fecha la vuelve provisional",
  como(FELIPE) + fijarDevuelve("lim", 6, 32, "2026-10-04", 1) + "\n" + leer("lim") + "\n" + fijarDevuelve("lim", 6, 32, null, 2) + "\n" + leer("lim"),
  (s) => s.split("\n")[1] === "6x32=192,false" && s.split("\n")[3] === "6x32=192,true"
);
caso(
  "redondea a 2 decimales: 22,004 m² es lo mismo que 22 y no se anota como cambio",
  como(FELIPE) + fijarDevuelve("tru", 22, 30, "2026-09-30", 1) + "\n" + fijarDevuelve("tru", 22.004, 30, "2026-09-30", 2),
  (s) => s.endsWith('"sin_cambios": true}')
);
caso(
  "una TIENDA NUEVA nace sin capacidad (cero filas); se fija con versión 0 y nace en la versión 1",
  `insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede de prueba', 'tienda', true);
   select id as nueva from retail.ubicaciones where nombre = 'Sede de prueba' \\gset\n` +
    como(FELIPE) + leer("nueva") + "\n" + fijarDevuelve("nueva", 12.5, 30, null, 0) + "\n" + leer("nueva"),
  'sin_fila\n{"version": 1, "capacidad": 375, "provisional": true, "sin_cambios": false}\n12.5x30=375,true'
);
caso(
  "en una tienda que ya tiene capacidad, «versión 0» (creía que no tenía) con otros números es PT409",
  como(FELIPE) + `select split_part(${fijar("tru", 25, 30, null, 0).replace(/^select /, "").replace(/;$/, "")}, '|', 1);`,
  "PT409"
);
{
  const hint = (sql) => `select split_part(${sql.replace(/^select /, "").replace(/;$/, "")}, '|', 2);`;
  caso(
    "valida: m² en 0 o de más, densidad de más, capacidad < 1, fecha futura o de antes de 2026, sin versión, Taller, sede inexistente",
    como(FELIPE) +
      [
        hint(fijar("tru", 0, 30, null, 1)),
        hint(fijar("tru", 2001, 30, null, 1)),
        hint(fijar("tru", 20, 151, null, 1)),
        hint(fijar("tru", 1, 0.5, null, 1)),
        hint(fijar("tru", 20, 30, "2099-01-01", 1)),
        hint(fijar("tru", 20, 30, "2025-12-31", 1)),
        hint(fijar("tru", 20, 30, null, "null")),
        hint(fijar("taller", 20, 30, null, 0)),
        `select split_part(pg_temp.intento('select retail.fijar_capacidad_piso(gen_random_uuid(), 20, 30, null, 0)'), '|', 2);`,
      ].join("\n") + "\n" + leer("tru"),
    [
      "capacidad_m2_fuera_de_rango",
      "capacidad_m2_fuera_de_rango",
      "capacidad_densidad_fuera_de_rango",
      "capacidad_cero",
      "capacidad_fecha_conteo",
      "capacidad_fecha_conteo",
      "capacidad_sin_version",
      "capacidad_solo_tiendas",
      "capacidad_sede_inexistente",
      "20x30=600,false",
    ].join("\n")
  );
}
caso(
  "por la vía de PostgREST (rol authenticated) el líder guarda; la tabla directo, no",
  como(FELIPE) + `set local role authenticated;\n` + fijarDevuelve("tru", 21, 30, "2026-09-30", 1) + "\n" +
    `select split_part(pg_temp.intento(format('update retail.capacidad_piso set m2_sala = 99 where ubicacion_id = %L', :'tru')), '|', 1);`,
  '{"version": 2, "capacidad": 630, "provisional": false, "sin_cambios": false}\n42501'
);

// ===========================================================================
// 4. EL ESQUEMA (ni siquiera por fuera de la función)
// ===========================================================================

{
  const estado = (sql) => `select split_part(pg_temp.intento($q$${sql}$q$), '|', 1);`;
  caso(
    "candados de la tabla: capacidad escrita a mano, m² o densidad fuera de rango, capacidad < 1, conteo de 2025, Taller, otra sede repetida",
    [
      estado(`update retail.capacidad_piso set capacidad = 5000 where ubicacion_id = '__TRU__'`),
      estado(`update retail.capacidad_piso set m2_sala = 0 where ubicacion_id = '__TRU__'`),
      estado(`update retail.capacidad_piso set densidad = 151 where ubicacion_id = '__TRU__'`),
      estado(`update retail.capacidad_piso set m2_sala = 0.5, densidad = 1 where ubicacion_id = '__TRU__'`),
      estado(`update retail.capacidad_piso set contada_el = '2025-12-31' where ubicacion_id = '__TRU__'`),
      estado(`insert into retail.capacidad_piso (ubicacion_id, m2_sala, densidad) values ('__TALLER__', 10, 30)`),
      estado(`update retail.capacidad_piso set ubicacion_id = '__TALLER__' where ubicacion_id = '__LIM__'`),
      estado(`insert into retail.capacidad_piso (ubicacion_id, m2_sala, densidad) values ('__TRU__', 10, 30)`),
    ]
      .join("\n")
      .replaceAll("'__TRU__'", "$q$ || quote_literal(:'tru') || $q$")
      .replaceAll("'__TALLER__'", "$q$ || quote_literal(:'taller') || $q$")
      .replaceAll("'__LIM__'", "$q$ || quote_literal(:'lim') || $q$"),
    ["428C9", "23514", "23514", "23514", "23514", "23514", "23514", "23505"].join("\n")
  );
}
caso(
  "la versión no se fija a mano: cualquier escritura la sube en uno (ADR-0193, fn_subir_version)",
  `update retail.capacidad_piso set version = 99, densidad = 31 where ubicacion_id = :'tru';
   select version || ',' || capacidad from retail.capacidad_piso where ubicacion_id = :'tru';`,
  "2,620"
);

// ===========================================================================
// 5. LA MIGRACIÓN
// ===========================================================================

caso(
  "la migración se puede pegar dos veces seguidas: misma tabla, mismas funciones, mismas filas",
  `${MIGRACION}
   select md5(string_agg(prosrc, '' order by proname)) as m1 from pg_proc where pronamespace = 'retail'::regnamespace
      and proname in ('fn_capacidad_piso', 'fijar_capacidad_piso', 'fn_capacidad_piso_solo_tiendas') \\gset
   ${MIGRACION}
   select (md5(string_agg(prosrc, '' order by proname)) = :'m1') || ',' || count(*) from pg_proc where pronamespace = 'retail'::regnamespace
      and proname in ('fn_capacidad_piso', 'fijar_capacidad_piso', 'fn_capacidad_piso_solo_tiendas');
   select count(*) from retail.capacidad_piso;`,
  "true,3\n2"
);
{
  // Lo que se ejecuta, sin la cabecera ni los comentarios (que nombran `create policy` y `drop trigger` para explicarlos).
  const sql = MIGRACION.replace(/--[^\n]*/g, "");
  registrar(
    "la migración sigue las reglas de pegado: sin políticas, sin `drop trigger`, sin `alter table` de una tabla en uso, con `lock_timeout` y `set search_path`",
    [
      !/create\s+policy/i.test(sql),
      !/drop\s+trigger/i.test(sql),
      // El único `alter table` es el de la tabla nueva (encender RLS).
      [...sql.matchAll(/alter\s+table\s+([\w.]+)/gi)].every((m) => m[1] === "retail.capacidad_piso"),
      /set lock_timeout = '3s';/.test(sql),
      /set search_path = retail, public, extensions;/.test(sql),
    ].join(","),
    "true,true,true,true,true"
  );
}
caso(
  "permisos: anon no ejecuta ninguna de las dos; authenticated sí; la del disparador no la llama nadie",
  `select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute') || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ' ' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('fn_capacidad_piso', 'fijar_capacidad_piso', 'fn_capacidad_piso_solo_tiendas');`,
  "fijar_capacidad_piso:false:true fn_capacidad_piso:false:true fn_capacidad_piso_solo_tiendas:false:false"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas > 0) process.exit(1);
