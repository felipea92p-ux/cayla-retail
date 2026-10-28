#!/usr/bin/env node
/**
 * Crea (o pone al día) el usuario con el que la tienda se conecta a la base LOCAL: `tienda_web_local`, que hereda el rol
 * `tienda_web` de la migración 20261014220000 (ADR-0408) y nada más. Solo local: el contenedor de `supabase start`.
 * En producción ese usuario lo crea Felipe, con su propia contraseña, en la actividad 13; nunca este script.
 *
 * USO
 *   pnpm --filter tienda rol-local
 *   pnpm --filter tienda rol-local -- --contenedor supabase_db_<mi-pila>
 *
 * La contraseña local es la de `.env.example` («tienda-local»); otra, con TIENDA_DB_CLAVE_LOCAL.
 */
import { execFileSync } from "node:child_process";

const i = process.argv.indexOf("--contenedor");
const CONTENEDOR = i > 0 ? process.argv[i + 1] : "supabase_db_cayla-retail";
const CLAVE = process.env.TIENDA_DB_CLAVE_LOCAL ?? "tienda-local";
if (!/^[A-Za-z0-9-]{8,64}$/.test(CLAVE)) {
  console.error("TIENDA_DB_CLAVE_LOCAL: de 8 a 64 letras, números o guiones.");
  process.exit(2);
}

// Un tope de 5 s por consulta: una portada nunca se queda colgada esperando a la base (principio 9).
const SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tienda_web') then
    raise exception 'Falta el rol tienda_web: aplica supabase/migrations/20261014220000_tienda_puerta_y_portada.sql';
  end if;
  if exists (select 1 from pg_roles where rolname = 'tienda_web_local') then
    alter role tienda_web_local login password '${CLAVE}';
  else
    create role tienda_web_local login password '${CLAVE}';
  end if;
end
$$;
grant tienda_web to tienda_web_local;
alter role tienda_web_local set statement_timeout = '5s';
select 'listo: tienda_web_local hereda ' || string_agg(r.rolname, ', ') from pg_auth_members m join pg_roles r on r.oid = m.roleid
 where m.member = 'tienda_web_local'::regrole;
`;

try {
  const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
    input: SQL,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(salida.trim());
  console.log("Copia apps/tienda/.env.example a apps/tienda/.env.local y corre: pnpm --filter tienda dev");
} catch (e) {
  console.error(`No se pudo crear el usuario en ${CONTENEDOR}: ${String(e.stderr ?? e.message).trim()}`);
  process.exit(1);
}
