#!/usr/bin/env node
/**
 * Pruebas de la firma de respaldo de una terminal (migraciones `20261019185000_terminal_firma_de_respaldo.sql` y
 * `20261019190000_terminales_de_lima_sin_responsable.sql`) — CAYLA V2, ADR-0454.
 *
 * QUÉ PRUEBA. Que una terminal con `firma_respaldo_id` (hoy: Caja Lima y Almacén Lima) opere SIN responsable, y que NADA más cambie:
 *   · terminal con respaldo, sin responsable y sin asistencia → `fn_actor_persona_id` devuelve el respaldo (no rechaza);
 *   · terminal con respaldo que además manda `x-responsable` → firma igual el respaldo (el encabezado no cambia nada);
 *   · terminal SIN respaldo (la de otra tienda) → el candado de siempre (`responsable_requerido`);
 *   · `fn_actor_persona_id(false)` (comparar «tú contra tú» en permisos) de una terminal con respaldo → sigue pidiendo responsable;
 *   · un respaldo suspendido o sin acceso a retail → falla CERRADO: la terminal vuelve a pedir responsable;
 *   · el respaldo NO da poderes: `fn_es_lider()` de la terminal sigue falso aunque el respaldo sea líder;
 *   · `fn_terminal_firma_respaldo()` le dice a la web quién es (y cero filas a una persona o a una terminal sin respaldo);
 *   · la persona sigue igual (con el interruptor encendido pide responsable);
 *   · «volver»: vaciar `firma_respaldo_id` devuelve el candado;
 *   · la activación solo toca las terminales de «Tienda LIM», y en una base sin la persona de respaldo no hace nada;
 *   · el cambio a Claudia (`20261023223000`) solo cambia de quién es una firma que ya existe: no enciende ninguna.
 *
 * CÓMO. Mismo patrón que `responsable_omitido.mjs`: cada caso en su transacción con ROLLBACK; las terminales, las personas y
 * la asistencia de Dynamic se crean dentro. El encabezado HTTP se simula con `request.headers`, como hace PostgREST.
 *
 * USO
 *   pnpm pruebas:terminal-sin-responsable                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:terminal-sin-responsable --base cayla_x  → contra otra base del mismo contenedor
 *   … --en-seco                                            → carga las migraciones dentro de cada caso (la base aún no las tiene)
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
const leer = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MECANISMO = leer("20261019185000_terminal_firma_de_respaldo.sql");
const ACTIVACION = leer("20261019190000_terminales_de_lima_sin_responsable.sql");
const A_CLAUDIA = leer("20261023223000_terminales_de_lima_firman_claudia.sql");

const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo (seed), no es admin
const T_VENTAS_AUTH = "33333333-3333-4333-8333-0000000000a1"; // terminal de ventas de Trujillo (la que lleva respaldo)
const T_OTRA_AUTH = "33333333-3333-4333-8333-0000000000a2"; // terminal de ventas de otra tienda (sin respaldo)
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta: el respaldo
const LIA = "33333333-3333-4333-8333-0000000000b2"; // LÍDER de retail, sin cuenta: otro respaldo (para probar que no da poderes)
const OTRA = "33333333-3333-4333-8333-0000000000b3"; // integrante que se elige en el combo
const FELIPE = "13ef8ea3-7bd4-4522-bae0-264c087ece5f"; // la persona que nombra la activación (producción)
const CLAUDIA = "079e4764-6056-4fca-abb9-eaabd297e1ca"; // a quien pasa la firma el 2026-10-23 (producción)

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

const PRELUDIO = `
begin;
${EN_SECO ? MECANISMO : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
-- El interruptor de producción: TODA operación de tienda exige responsable.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
delete from public.marcajes;
delete from public.jornadas;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         (select id from retail.ubicaciones where nombre = 'Tienda Lima') as otra,
         (select sede_dynamic_id from retail.ubicaciones where nombre = 'Tienda Trujillo') as sede_tru,
         (select id from public.personas where auth_user_id = '${MICAELA_AUTH}') as micaela;
grant select on ids to authenticated;
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local'),
  ('${T_OTRA_AUTH}', 'authenticated', 'authenticated', 'terminal-ventas-otra@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select tru, 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_AUTH}'::uuid from ids;
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select otra, 'Terminal Ventas otra tienda', retail.fn_rol_por_clave('terminal_ventas'), '${T_OTRA_AUTH}'::uuid from ids;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${ROSA}', 'Rosa', 'Prueba', 'activo', sede_tru from ids;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${LIA}', 'Lia', 'Lider', 'activo', sede_tru from ids;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${OTRA}', 'Otra', 'Prueba', 'activo', sede_tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${ROSA}', 'colaborador', tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${LIA}', 'lider', tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${OTRA}', 'colaborador', tru from ids;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const conEncabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
const conRespaldo = (persona, terminalAuth = T_VENTAS_AUTH) =>
  `update retail.terminales set firma_respaldo_id = '${persona}' where auth_user_id = '${terminalAuth}';\n`;
const actor = `select pg_temp.intento('select retail.fn_actor_persona_id()');`;
const actorValor = `select coalesce(retail.fn_actor_persona_id()::text, 'NULL');`;
const esPersona = (id) => `select (retail.fn_actor_persona_id() = '${id}'::uuid)::text;`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// ---------------- La terminal con respaldo ----------------
caso("terminal con respaldo, sin responsable y SIN asistencia → firma el respaldo, no rechaza", conRespaldo(ROSA) + como(T_VENTAS_AUTH) + esPersona(ROSA), "true");
caso(
  "terminal con respaldo que manda x-responsable de otra persona (no presente) → firma igual el respaldo",
  conRespaldo(ROSA) + como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable": OTRA }) + esPersona(ROSA),
  "true"
);
caso(
  "terminal con respaldo + una clave de acción soltada → firma el respaldo (no queda en NULL)",
  conRespaldo(ROSA) + como(T_VENTAS_AUTH) + conEncabezados({ "x-responsable-omitido": "conteo_cerrar" }) + esPersona(ROSA),
  "true"
);
caso("terminal con respaldo, fn_actor_persona_id(false) → sigue pidiendo responsable (es para comparar con la cuenta)", conRespaldo(ROSA) + como(T_VENTAS_AUTH) + `select pg_temp.intento('select retail.fn_actor_persona_id(false)');`, "42501|responsable_requerido");

// ---------------- Lo que NO cambia ----------------
caso("terminal SIN respaldo (la de otra tienda) → el candado de siempre", conRespaldo(ROSA) + como(T_OTRA_AUTH) + actor, "42501|responsable_requerido");
caso("la misma terminal, antes de ponerle respaldo → el candado de siempre", como(T_VENTAS_AUTH) + actor, "42501|responsable_requerido");
caso("persona con el interruptor encendido y sin responsable → pide responsable (no cambia lo de siempre)", conRespaldo(ROSA) + como(MICAELA_AUTH) + actor, "42501|responsable_requerido");
caso(
  "terminal desactivada con respaldo → no firma como respaldo (la cuenta ni siquiera es una terminal activa)",
  conRespaldo(ROSA) + `update retail.terminales set activo = false, desactivada_at = now() where auth_user_id = '${T_VENTAS_AUTH}';\n` + como(T_VENTAS_AUTH) + actor,
  (s) => s !== "SIN_ERROR" && !s.includes(ROSA)
);

// ---------------- Falla cerrado ----------------
caso(
  "respaldo suspendido (estado ≠ activo) → la terminal vuelve a pedir responsable",
  conRespaldo(ROSA) + `update public.personas set estado = 'inactivo' where id = '${ROSA}';\n` + como(T_VENTAS_AUTH) + actor,
  "42501|responsable_requerido"
);
caso(
  "respaldo sin acceso a retail (sin fila en colaboradores) → la terminal vuelve a pedir responsable",
  conRespaldo(ROSA) + `delete from retail.colaboradores where persona_id = '${ROSA}';\n` + como(T_VENTAS_AUTH) + actor,
  "42501|responsable_requerido"
);

// ---------------- Sin poderes ----------------
caso(
  "el respaldo NO da poderes: aunque firme a nombre de un LÍDER, la terminal no es líder",
  conRespaldo(LIA) + como(T_VENTAS_AUTH) + `select (retail.fn_actor_persona_id() = '${LIA}'::uuid)::text || ',' || retail.fn_es_lider()::text;`,
  "true,false"
);

// ---------------- Lo que lee la web ----------------
caso("fn_terminal_firma_respaldo() de la terminal con respaldo → su persona y su nombre corto", conRespaldo(ROSA) + como(T_VENTAS_AUTH) + `select persona_id || '|' || nombre from retail.fn_terminal_firma_respaldo();`, `${ROSA}|Rosa P.`);
caso("fn_terminal_firma_respaldo() de una terminal sin respaldo → ninguna fila", conRespaldo(ROSA) + como(T_OTRA_AUTH) + `select count(*) from retail.fn_terminal_firma_respaldo();`, "0");
caso("fn_terminal_firma_respaldo() de una persona → ninguna fila", conRespaldo(ROSA) + como(MICAELA_AUTH) + `select count(*) from retail.fn_terminal_firma_respaldo();`, "0");
caso(
  "la API no puede llamar a fn_terminal_firma_respaldo_id(uuid) (solo fn_actor_persona_id)",
  conRespaldo(ROSA) + `set local role authenticated;\nselect pg_temp.intento('select retail.fn_terminal_firma_respaldo_id(gen_random_uuid())');`,
  (s) => s.startsWith("42501|")
);

// ---------------- «Volver» ----------------
caso(
  "VOLVER: vaciar firma_respaldo_id devuelve el candado a la terminal",
  conRespaldo(ROSA) + `update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;\n` + como(T_VENTAS_AUTH) + actor,
  "42501|responsable_requerido"
);
caso(
  "la migración del mecanismo se puede pegar dos veces (re-ejecutable): sigue firmando el respaldo",
  conRespaldo(ROSA) + MECANISMO + como(T_VENTAS_AUTH) + esPersona(ROSA),
  "true"
);

// ---------------- La activación (solo Tienda LIM) ----------------
const ACTIVAR = `
update retail.ubicaciones set nombre = 'Tienda LIM' where id = (select tru from ids);
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${FELIPE}', 'Felipe', 'Alvarez', 'activo', sede_tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${FELIPE}', 'lider', tru from ids;
${ACTIVACION}
`;
caso(
  "ACTIVACIÓN: la terminal de «Tienda LIM» queda con firma de respaldo a nombre de Felipe",
  ACTIVAR + `select firma_respaldo_id::text from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';`,
  FELIPE
);
caso(
  "ACTIVACIÓN: la terminal de OTRA tienda no se toca",
  ACTIVAR + `select coalesce(firma_respaldo_id::text, 'NULL') from retail.terminales where auth_user_id = '${T_OTRA_AUTH}';`,
  "NULL"
);
caso(
  "ACTIVACIÓN: la terminal de Lima ya opera sin responsable y sin asistencia",
  ACTIVAR + como(T_VENTAS_AUTH) + esPersona(FELIPE),
  "true"
);
caso(
  "ACTIVACIÓN: en una base SIN la persona de respaldo (local, CI) no activa nada",
  `update retail.ubicaciones set nombre = 'Tienda LIM' where id = (select tru from ids);\n${ACTIVACION}\nselect count(*) from retail.terminales where firma_respaldo_id is not null;`,
  "0"
);
caso(
  "ACTIVACIÓN: se puede pegar dos veces (re-ejecutable)",
  ACTIVAR + ACTIVACION + `select count(*) from retail.terminales where firma_respaldo_id = '${FELIPE}';`,
  "1"
);

// ---------------- La firma pasa a Claudia (2026-10-23) ----------------
const CON_CLAUDIA = `
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) select '${CLAUDIA}', 'Claudia', 'Pereyra', 'activo', sede_tru from ids;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) select '${CLAUDIA}', 'colaborador', tru from ids;
`;
caso(
  "A CLAUDIA: la terminal de Lima pasa de Felipe a Claudia, y firma a su nombre sin responsable ni asistencia",
  ACTIVAR + CON_CLAUDIA + A_CLAUDIA + como(T_VENTAS_AUTH) + `select persona_id || '|' || nombre from retail.fn_terminal_firma_respaldo();`,
  `${CLAUDIA}|Claudia P.`
);
caso(
  "A CLAUDIA: la terminal de OTRA tienda sigue sin respaldo",
  ACTIVAR + CON_CLAUDIA + A_CLAUDIA + `select coalesce(firma_respaldo_id::text, 'NULL') from retail.terminales where auth_user_id = '${T_OTRA_AUTH}';`,
  "NULL"
);
caso(
  "A CLAUDIA: no enciende nada — si Lima ya volvió a pedir responsable, sigue pidiéndolo",
  ACTIVAR + CON_CLAUDIA + `update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;\n` + A_CLAUDIA + como(T_VENTAS_AUTH) + actor,
  "42501|responsable_requerido"
);
caso(
  "A CLAUDIA: en una base SIN Claudia no cambia nada (Lima sigue con Felipe)",
  ACTIVAR + A_CLAUDIA + `select firma_respaldo_id::text from retail.terminales where auth_user_id = '${T_VENTAS_AUTH}';`,
  FELIPE
);
caso(
  "A CLAUDIA: se puede pegar dos veces (re-ejecutable)",
  ACTIVAR + CON_CLAUDIA + A_CLAUDIA + A_CLAUDIA + `select count(*) from retail.terminales where firma_respaldo_id = '${CLAUDIA}';`,
  "1"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
