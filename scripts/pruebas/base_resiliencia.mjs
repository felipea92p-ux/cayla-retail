#!/usr/bin/env node
/**
 * Prueba de integración de las dos migraciones de «la base se cae» (ADR-0450) contra el Postgres LOCAL:
 *   20261017225000_fn_salud.sql                    → `retail.fn_salud()`, el «¿responde la base?» de `/api/salud`.
 *   20261017230000_tienda_web_topes_de_conexion.sql → topes de conexión y de tiempo al usuario de la tienda.
 *
 * Verifica lo que ninguna prueba de TypeScript puede:
 *   (1) `fn_salud()` devuelve true como `anon`, `authenticated` y `service_role`; es estable, de quien la llama y con `search_path`
 *       vacío; nadie la tiene por «PUBLIC» (solo los tres roles); y no lee ninguna tabla.
 *   (2) Los topes llegan a TODO usuario que puede entrar y es miembro de `tienda_web` (20 conexiones, 5 s por consulta, 10 s en una
 *       transacción quieta), también a uno que se llame distinto (el usuario de producción no está en las migraciones).
 *   (3) No tocan a nadie más: ni un usuario que no es de `tienda_web`, ni el rol `tienda_web` mismo (un grupo que no entra), ni los
 *       roles del ERP (`authenticator`, `authenticated`, `anon`, `service_role`, `postgres`).
 *   (4) Idempotentes (pegarlas dos veces deja lo mismo) y sin usuario de la tienda no fallan (así corren en el CI y en local).
 *
 * Mismo mecanismo que `fn_resumen_variantes.mjs`: `docker exec … psql` y ROLLBACK SIEMPRE (los roles de prueba se crean dentro de la
 * transacción y desaparecen con ella: no queda nada en el Postgres compartido).
 *
 * USO
 *   pnpm pruebas:base-resiliencia    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = new URL("../../", import.meta.url);
const MIGRACION_SALUD = readFileSync(new URL("supabase/migrations/20261017225000_fn_salud.sql", RAIZ), "utf8");
const MIGRACION_TOPES = readFileSync(new URL("supabase/migrations/20261017230000_tienda_web_topes_de_conexion.sql", RAIZ), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Corre `sql` dentro de una transacción que SIEMPRE termina en ROLLBACK y devuelve lo que imprimió. */
function enTransaccion(sql) {
  return psql(`begin;\n${sql}\nrollback;\n`);
}

let fallos = 0;
function reportar(nombre, cumple, detalle = "") {
  console.log(`${cumple ? "✓" : "✗"} ${nombre}${cumple ? "" : `  →  ${detalle}`}`);
  if (!cumple) fallos += 1;
}

// ── (1) fn_salud ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const salida = enTransaccion(`
${MIGRACION_SALUD}
set local role anon;          select 'anon|' || retail.fn_salud();
reset role;
set local role authenticated; select 'authenticated|' || retail.fn_salud();
reset role;
set local role service_role;  select 'service_role|' || retail.fn_salud();
reset role;
select 'props|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_salud';
select 'publico|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
  where n.nspname = 'retail' and p.proname = 'fn_salud' and a.grantee = 0;
select 'firmas|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_salud';
`);
  reportar("(1a) fn_salud() devuelve true como anon", salida.includes("anon|true"), salida);
  reportar("(1b) …como authenticated", salida.includes("authenticated|true"), salida);
  reportar("(1c) …y como service_role", salida.includes("service_role|true"), salida);
  const props = salida.split("\n").find((l) => l.startsWith("props|")) ?? "";
  reportar("(1d) estable (s), de quien la llama, con search_path vacío y sin leer ninguna tabla (select true)", /^props\|s\|false\|search_path=""\|\s*select true\s*$/.test(props), props);
  reportar("(1e) nadie la ejecuta por «PUBLIC»: solo anon, authenticated y service_role", salida.includes("publico|0"), salida);
  reportar("(1f) una sola firma viva", salida.includes("firmas|1"), salida);
}

// ── (2)(3)(4) topes de la tienda ──────────────────────────────────────────────────────────────────────────────────
{
  const ROLES_DEL_ERP = "'authenticator','authenticated','anon','service_role','postgres','tienda_web'";
  const foto = (etiqueta) => `
select '${etiqueta}_roles|' || coalesce(string_agg(r.rolname || ':' || r.rolconnlimit, ',' order by r.rolname), '')
  from pg_roles r where r.rolname in (${ROLES_DEL_ERP});
select '${etiqueta}_ajustes|' || coalesce(string_agg(r.rolname || '=' || array_to_string(s.setconfig, ';'), ',' order by r.rolname), '')
  from pg_roles r join pg_db_role_setting s on s.setrole = r.oid where r.rolname in (${ROLES_DEL_ERP});`;

  const salida = enTransaccion(`
-- El grupo lo crea 20261014220000 (la puerta de la tienda); un Postgres local atrasado puede no tenerlo todavía: se crea igual, dentro de
-- la transacción, y desaparece con el ROLLBACK.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'tienda_web') then create role tienda_web nologin; end if; end $$;
create role prueba_tienda_uno login in role tienda_web;
create role prueba_tienda_dos login in role tienda_web;
create role prueba_ajeno login;
create role prueba_grupo_sin_login in role tienda_web;   -- miembro de tienda_web pero sin poder entrar: no se toca
${foto("antes")}
${MIGRACION_TOPES}
select 'uno|' || r.rolconnlimit || '|' || coalesce((select array_to_string(s.setconfig, ';') from pg_db_role_setting s where s.setrole = r.oid), '')
  from pg_roles r where r.rolname = 'prueba_tienda_uno';
select 'dos|' || r.rolconnlimit from pg_roles r where r.rolname = 'prueba_tienda_dos';
select 'ajeno|' || r.rolconnlimit || '|' || coalesce((select array_to_string(s.setconfig, ';') from pg_db_role_setting s where s.setrole = r.oid), '')
  from pg_roles r where r.rolname = 'prueba_ajeno';
select 'sinlogin|' || r.rolconnlimit || '|' || coalesce((select array_to_string(s.setconfig, ';') from pg_db_role_setting s where s.setrole = r.oid), '')
  from pg_roles r where r.rolname = 'prueba_grupo_sin_login';
${foto("despues")}
-- Pegada otra vez: lo mismo.
${MIGRACION_TOPES}
select 'dos_veces|' || r.rolconnlimit || '|' || coalesce((select array_to_string(s.setconfig, ';') from pg_db_role_setting s where s.setrole = r.oid), '')
  from pg_roles r where r.rolname = 'prueba_tienda_uno';
-- Sin ningún usuario de la tienda: no falla.
drop role prueba_tienda_uno; drop role prueba_tienda_dos; drop role prueba_grupo_sin_login;
${MIGRACION_TOPES}
select 'sin_usuarios|ok';
`);
  const linea = (prefijo) => salida.split("\n").find((l) => l.startsWith(prefijo)) ?? "";
  const uno = linea("uno|");
  reportar("(2a) un usuario de tienda_web queda con 20 conexiones, 5 s por consulta y 10 s en transacción quieta",
    uno.startsWith("uno|20|") && uno.includes("statement_timeout=5s") && uno.includes("idle_in_transaction_session_timeout=10s"), uno);
  reportar("(2b) también el otro usuario de tienda_web, con otro nombre (el de producción no está en las migraciones)", linea("dos|") === "dos|20", linea("dos|"));
  reportar("(3a) un usuario que no es de tienda_web no se toca", linea("ajeno|") === "ajeno|-1|", linea("ajeno|"));
  reportar("(3b) un miembro de tienda_web que no puede entrar no se toca", linea("sinlogin|") === "sinlogin|-1|", linea("sinlogin|"));
  reportar("(3c) los roles del ERP y el grupo tienda_web quedan exactamente igual (límites y ajustes)",
    linea("antes_roles|").replace("antes_", "") === linea("despues_roles|").replace("despues_", "") &&
      linea("antes_ajustes|").replace("antes_", "") === linea("despues_ajustes|").replace("despues_", ""),
    `${linea("antes_roles|")} vs ${linea("despues_roles|")}`);
  reportar("(4a) pegada dos veces deja lo mismo (sin ajustes repetidos)", linea("dos_veces|") === uno.replace("uno|", "dos_veces|"), `${linea("dos_veces|")} vs ${uno}`);
  reportar("(4b) sin ningún usuario de la tienda no falla (así corre en el CI y en local)", salida.includes("sin_usuarios|ok"), salida);
}

if (fallos > 0) {
  console.error(`\n${fallos} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodo en verde.");
