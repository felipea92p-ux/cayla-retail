#!/usr/bin/env node
/**
 * Pruebas de «una terminal ya no llena el registro de errores al abrir una pantalla» (migración
 * `20261027140000_terminal_lecturas_sin_ruido.sql`) — CAYLA V2, ADR-0533.
 *
 * QUÉ PRUEBA. Que `fn_mi_persona_id()` y `fn_mi_pantalla_principal()` (las dos lecturas que la web hace en CADA pantalla) no rechacen a una
 * terminal, y que NADA más cambie:
 *   · una persona: `fn_mi_persona_id()` da el mismo id que `fn_actor_persona_id(false)`, y `fn_mi_pantalla_principal()` da lo mismo que daba
 *     con la lectura vieja (la comparación se hace contra el cuerpo viejo, escrito acá);
 *   · una terminal: las dos lecturas devuelven NULL SIN error (antes: 42501 «Elige quién hace esta operación», 4 258 al día);
 *   · sin sesión: NULL;
 *   · `fn_actor_persona_id(false)` de una terminal SIGUE rechazando (es un candado de permisos, esta migración no lo toca);
 *   · `anon` no puede ejecutar `fn_mi_persona_id`, `authenticated` sí.
 *
 * CÓMO. Mismo patrón que `terminal_sin_responsable.mjs`: cada caso en su transacción con ROLLBACK; la terminal se crea dentro. El encabezado
 * de sesión se simula con `request.jwt.claim.sub`, como hace PostgREST.
 *
 * USO
 *   pnpm pruebas:terminal-lecturas-sin-ruido                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:terminal-lecturas-sin-ruido --base cayla_x  → contra otra base del mismo contenedor
 *   … --en-seco                                              → carga la migración dentro de cada caso (la base aún no la tiene)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261027140000_terminal_lecturas_sin_ruido.sql"), "utf8");

const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo (seed), no es admin
const T_AUTH = "33333333-3333-4333-8333-0000000000c1"; // terminal de ventas de Trujillo, creada dentro de cada caso

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
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return 'SIN_ERROR|' || coalesce(v_res, 'NULL');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
insert into auth.users (id, aud, role, email) values ('${T_AUTH}', 'authenticated', 'authenticated', 'terminal-lecturas-tru@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), 'Terminal Lecturas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_AUTH}'::uuid;
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const sinSesion = `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

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

// La lectura de ANTES (cuerpo de 20260925220000): la referencia con la que se compara a una persona.
const PANTALLA_VIEJA = `(select r.pantalla_principal from retail.colaboradores c join retail.roles r on r.id = c.rol_id where c.persona_id = retail.fn_actor_persona_id(false))`;

// ---------------- Una persona: lo mismo que antes ----------------
caso("persona: fn_mi_persona_id() da el mismo id que fn_actor_persona_id(false)", como(MICAELA_AUTH) + `select (retail.fn_mi_persona_id() = retail.fn_actor_persona_id(false) and retail.fn_mi_persona_id() is not null)::text;`, "true");
caso(
  "persona: fn_mi_pantalla_principal() da lo mismo que la lectura de antes (con una pantalla elegida)",
  como(MICAELA_AUTH) +
    `update retail.roles set pantalla_principal = 'inicio' where id = (select rol_id from retail.colaboradores where persona_id = retail.fn_mi_persona_id());\n` +
    `select (retail.fn_mi_pantalla_principal() is not distinct from ${PANTALLA_VIEJA} and retail.fn_mi_pantalla_principal() = 'inicio')::text;`,
  "true"
);
caso("persona: fn_mi_pantalla_principal() sin pantalla elegida → NULL, igual que antes", como(MICAELA_AUTH) + `select (retail.fn_mi_pantalla_principal() is not distinct from ${PANTALLA_VIEJA})::text;`, "true");

// ---------------- Una terminal: ni un solo rechazo ----------------
caso("terminal: fn_mi_persona_id() → NULL, sin error", como(T_AUTH) + `select pg_temp.intento('select retail.fn_mi_persona_id()::text');`, "SIN_ERROR|NULL");
caso("terminal: fn_mi_pantalla_principal() → NULL, sin error", como(T_AUTH) + `select pg_temp.intento('select retail.fn_mi_pantalla_principal()');`, "SIN_ERROR|NULL");
caso("sin sesión: fn_mi_persona_id() → NULL, sin error", sinSesion + `select pg_temp.intento('select retail.fn_mi_persona_id()::text');`, "SIN_ERROR|NULL");

// ---------------- Lo que NO cambia ----------------
caso("terminal: fn_actor_persona_id(false) SIGUE rechazando (el candado de permisos no se toca)", como(T_AUTH) + `select pg_temp.intento('select retail.fn_actor_persona_id(false)::text');`, "42501|responsable_requerido");
caso("terminal: fn_actor_persona_id(true) SIGUE rechazando sin responsable", como(T_AUTH) + `select pg_temp.intento('select retail.fn_actor_persona_id(true)::text');`, "42501|responsable_requerido");

// ---------------- Permisos ----------------
caso(
  "permisos: anon no ejecuta fn_mi_persona_id; authenticated y service_role sí",
  `select (has_function_privilege('anon', 'retail.fn_mi_persona_id()', 'execute'))::text || '|' || (has_function_privilege('authenticated', 'retail.fn_mi_persona_id()', 'execute'))::text || '|' || (has_function_privilege('service_role', 'retail.fn_mi_persona_id()', 'execute'))::text;`,
  "false|true|true"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} FALLARON` : ""}`);
process.exit(fallas ? 1 : 0);
