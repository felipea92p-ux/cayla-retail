#!/usr/bin/env node
/**
 * Prueba del candado «solo por RPC» sobre ventas, venta_items, venta_anulacion_items, clientas,
 * conteos, lotes, transferencias y transferencia_items (ADR-0119, migración `20260923234700_ventas_clientas_conteos_lotes_solo_rpc.sql`).
 *
 * Tres cosas tienen que ser ciertas a la vez:
 *   1. CONTROL: con el «cómo se deshace» de la migración, la puerta del permiso se abre (si no,
 *      el harness no sabría ver el hueco y lo demás no probaría nada).
 *   2. Con la migración, toda escritura directa como `authenticated` o `anon` choca con
 *      «permission denied for table …» (antes de mirar RLS).
 *   3. Nada legítimo se rompe: las RPC `security definer` siguen escribiendo y la lectura sigue.
 *
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con la migración aplicada DENTRO
 * (el DDL es transaccional): el Postgres local compartido no cambia. `set local role
 * authenticated` es lo que hace que el permiso de tabla se evalúe de verdad.
 *
 * No cubre `registrar_venta` ni `recibir_lote` por RPC (sus fixtures dependen de caja,
 * asistencia y stock): son `security definer` con dueña `postgres`, el mismo mecanismo que los
 * dos casos de regresión, y producción ya opera con este candado.
 *
 * USO: pnpm pruebas:candado-ventas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(
  join(RAIZ, "supabase/migrations/20260923234700_ventas_clientas_conteos_lotes_solo_rpc.sql"),
  "utf8"
);
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed
const TABLAS = ["ventas", "venta_items", "venta_anulacion_items", "clientas", "conteos", "lotes", "transferencias", "transferencia_items"];
const INTENTOS = TABLAS.length * 3; // insert, update y delete por tabla

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

/** Intenta insert/update/delete directo en cada tabla y devuelve «tabla:op:resultado» por línea. */
const SONDA = `
create function pg_temp.sonda() returns setof text language plpgsql as $f$
declare t text; col text; o text; s text; r text;
begin
  foreach t in array array[${TABLAS.map((t) => `'${t}'`).join(",")}] loop
    select a.attname into col from pg_attribute a
      join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'retail' and c.relname = t and a.attnum > 0 and not a.attisdropped
      order by a.attnum limit 1;
    foreach o in array array['insert', 'update', 'delete'] loop
      s := case o when 'insert' then format('insert into retail.%I default values', t)
                  when 'update' then format('update retail.%I set %I = %I where false', t, col, col)
                  else format('delete from retail.%I where false', t) end;
      begin
        execute s; r := 'SIN_ERROR';
      exception when others then r := sqlerrm;
      end;
      return next t || ':' || o || ':' || r;
    end loop;
  end loop;
end $f$;
grant execute on function pg_temp.sonda() to authenticated, anon;
`;

// El «cómo se deshace» de la migración: el control lo aplica para simular la base de antes
// (en el CI y en producción la migración ya está puesta) y de paso prueba que la vuelta atrás sirve.
const DESHACER = `grant insert, update, delete on ${TABLAS.map((t) => `retail.${t}`).join(", ")} to authenticated;`;

/** Transacción con ROLLBACK: migración (o su reversa) → fixture como postgres → rol de la API → cuerpo. */
function dentro(cuerpo, { conCandado = true, rol = "authenticated", fixture = "" } = {}) {
  return psql(`
begin;
${conCandado ? MIGRACION : DESHACER}
${SONDA}
${fixture}
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claim.role = '${rol}';
set local role ${rol};
${cuerpo}
rollback;
`);
}

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join("\n    ")}`);
  }
}

const denegado = (linea) => /permission denied for table/.test(linea);

caso("CONTROL: deshecha la migración, authenticated cruza la puerta del permiso en las 8 tablas", () => {
  const lineas = dentro("select pg_temp.sonda();", { conCandado: false }).split("\n");
  const cerradas = lineas.filter(denegado);
  if (lineas.length !== INTENTOS || cerradas.length) return `esperaba ${INTENTOS} intentos sin «permission denied»:\n${cerradas.join("\n")}`;
});

caso("con la migración, las escrituras directas (insert/update/delete) de authenticated chocan con el permiso", () => {
  const lineas = dentro("select pg_temp.sonda();").split("\n");
  const abiertas = lineas.filter((l) => !denegado(l));
  if (lineas.length !== INTENTOS || abiertas.length) return `quedaron abiertas:\n${abiertas.join("\n")}`;
});

// anon ni siquiera tiene USAGE sobre `retail`: lo frena el schema o la tabla, las dos valen.
caso("con la migración, anon tampoco escribe directo", () => {
  const lineas = dentro("select pg_temp.sonda();", { rol: "anon" }).split("\n");
  const abiertas = lineas.filter((l) => !/permission denied for (table|schema)/.test(l));
  if (lineas.length !== INTENTOS || abiertas.length) return `quedaron abiertas:\n${abiertas.join("\n")}`;
});

caso("con la migración, authenticated sigue leyendo las 8 tablas", () => {
  const salida = dentro(TABLAS.map((t) => `select count(*) >= 0 from retail.${t};`).join("\n"));
  if (salida.split("\n").filter((l) => l === "t").length !== TABLAS.length) return `lectura inesperada:\n${salida}`;
});

caso("con la migración, registrar_clienta (RPC) sigue creando la clienta", () => {
  const salida = dentro(`
select retail.registrar_clienta('90119001', 'Prueba Candado', null, false, null, null) is not null;
select count(*) = 1 from retail.clientas where dni = '90119001';`);
  if (salida !== "t\nt") return `salida: ${salida}`;
});

caso("con la migración, abrir_conteo (RPC) sigue abriendo el conteo", () => {
  const fixture = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' limit 1 \\gset
select (select count(*) from (select retail.anular_conteo(id) from retail.conteos
  where ubicacion_id = :'trujillo' and estado = 'abierto') x) as _anulo_previo \\gset`;
  const salida = dentro(`
select retail.abrir_conteo(p_ubicacion_id => :'trujillo', p_sububicacion_id => :'sub_piso') as conteo \\gset
select count(*) = 1 from retail.conteos where id = :'conteo';`, { fixture });
  if (salida !== "t") return `salida: ${salida}`;
});

console.log(fallas ? `\n${fallas} en rojo.` : "\n6/6 pruebas en verde.");
process.exit(fallas ? 1 : 0);
