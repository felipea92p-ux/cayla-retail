/**
 * Prueba de la vista puente `retail.planilla_por_sede` — ADR-0133, F7 (D-33). Migración 20260921160000.
 *
 * La base local solo tiene un STUB de Dynamic, así que cada caso arma dentro de su transacción las tres piezas de Dynamic que la vista lee
 * (`sedes` ya existe; `periodos_planilla` y `v_planilla_pagada` se crean como tablas de ensayo), corre la migración TAL CUAL está en el repo y hace
 * ROLLBACK: no deja rastro.
 *
 * Qué garantiza:
 *   1. Agrega la planilla pagada por sede y período: personas, pagado, provisiones y costo total.
 *   2. Solo cuenta períodos `pagado` y deja fuera el grupo `prueba`.
 *   3. Un grupo de menos de 3 personas NO aparece (con una sola persona el agregado sería su sueldo).
 *   4. La vista no expone ninguna persona: ni `persona_id`, ni `nombre`, ni columnas de sueldo individual.
 *   5. Sabe cuál es el Taller por el `tipo` de la sede de Dynamic, no por su código.
 *   6. Es `security_invoker`: quien no tiene permiso de leer la planilla en Dynamic ve la vista VACÍA.
 *   7. Sin Dynamic (base local pura) la migración no falla y no crea la vista.
 *   8. Se puede pegar dos veces.
 *
 * USO
 *   pnpm pruebas:planilla-por-sede   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260921160000_planilla_por_sede.sql"), "utf8");

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Las piezas de Dynamic que la vista lee, como tablas de ensayo (solo las columnas que usa la vista).
const STUB = `
begin;
create table if not exists public.periodos_planilla (id uuid primary key, fecha_ini date, fecha_fin date, estado text);
create table public.v_planilla_pagada (periodo_id uuid, persona_id uuid, nombre text, sede_codigo text, grupo text, total numeric, provision_total numeric, costo_total numeric);
delete from public.periodos_planilla where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
insert into public.periodos_planilla values
  ('00000000-0000-4000-8000-0000000000a1', '2026-07-29', '2026-08-28', 'pagado'),
  ('00000000-0000-4000-8000-0000000000a2', '2026-08-29', '2026-09-27', 'abierto');
-- Un código de sede de ensayo que NO existe en el seed: el Taller es el de tipo 'taller', sea cual sea su código.
insert into public.sedes (codigo, nombre, tipo) select v.* from (values ('ZTALLER', 'Taller de ensayo', 'taller'), ('ZTIENDA', 'Tienda de ensayo', 'tienda')) v(codigo, nombre, tipo)
  where not exists (select 1 from public.sedes x where x.codigo = v.codigo);
${MIGRACION}
`;

/** N personas con su pago en una sede/período/grupo. */
const FILAS = (n, sede, periodo, grupo, total, prov) =>
  `insert into public.v_planilla_pagada select '${periodo}', gen_random_uuid(), 'Persona ' || g, '${sede}', '${grupo}', ${total}, ${prov}, ${total} + ${prov} from generate_series(1, ${n}) g;\n`;
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";

const CASOS = [
  {
    nombre: "1. agrega la planilla pagada por sede y período: personas, pagado, provisiones y costo total",
    tipo: "exito",
    sql: `${STUB}${FILAS(4, "ZTALLER", P1, "planilla", 1000, 200)}
select sede_codigo, sede_tipo, personas, pagado, provisiones, costo_total from retail.planilla_por_sede where sede_codigo = 'ZTALLER';
rollback;`,
    verificar: (c) => c[0] === "ZTALLER" && c[1] === "taller" && Number(c[2]) === 4 && Number(c[3]) === 4000 && Number(c[4]) === 800 && Number(c[5]) === 4800,
  },
  {
    nombre: "2. solo períodos pagados, y el grupo «prueba» queda fuera",
    tipo: "exito",
    sql: `${STUB}${FILAS(3, "ZTALLER", P1, "planilla", 100, 10)}${FILAS(3, "ZTALLER", P2, "planilla", 999, 99)}${FILAS(5, "ZTALLER", P1, "prueba", 500, 50)}${FILAS(3, "ZTALLER", P1, "rxh", 50, 5)}
select count(*), sum(personas), sum(costo_total) from retail.planilla_por_sede where sede_codigo = 'ZTALLER';
rollback;`,
    // Un solo período pagado; planilla (3 × 110) + rxh (3 × 55) = 6 personas y 495; el período abierto y «prueba» no cuentan.
    verificar: (c) => Number(c[0]) === 1 && Number(c[1]) === 6 && Number(c[2]) === 495,
  },
  {
    nombre: "3. un grupo de menos de 3 personas no aparece (el agregado sería el sueldo de alguien)",
    tipo: "exito",
    sql: `${STUB}${FILAS(2, "ZTIENDA", P1, "planilla", 1000, 100)}${FILAS(3, "ZTALLER", P1, "planilla", 1000, 100)}
select (select count(*) from retail.planilla_por_sede where sede_codigo = 'ZTIENDA'), (select count(*) from retail.planilla_por_sede where sede_codigo = 'ZTALLER');
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 1,
  },
  {
    nombre: "4. la vista no expone a ninguna persona: ni persona_id, ni nombre, ni sueldo individual",
    tipo: "exito",
    sql: `${STUB}
select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'retail' and table_name = 'planilla_por_sede';
rollback;`,
    verificar: (c) => !/persona_id|nombre|salario|dni|rango|fila/.test(c[0]) && c[0].includes("costo_total") && c[0].includes("personas"),
  },
  {
    nombre: "5. sin permiso en Dynamic la vista sale VACÍA (security_invoker)",
    tipo: "exito",
    sql: `${STUB}${FILAS(4, "ZTALLER", P1, "planilla", 1000, 200)}
alter table public.v_planilla_pagada enable row level security;
create policy solo_admin on public.v_planilla_pagada for select to authenticated using (false);
grant select on public.v_planilla_pagada, public.periodos_planilla, public.sedes to authenticated;
select (select count(*) from retail.planilla_por_sede) as como_dueno \\gset
set local role authenticated;
select :'como_dueno', (select count(*) from retail.planilla_por_sede);
rollback;`,
    verificar: (c) => Number(c[0]) >= 1 && Number(c[1]) === 0,
  },
  {
    nombre: "6. sin Dynamic (base local pura) la migración no falla y no crea la vista",
    tipo: "exito",
    sql: `begin;
drop view if exists retail.planilla_por_sede;
${MIGRACION}
select to_regclass('retail.planilla_por_sede') is null;
rollback;`,
    verificar: (c) => c[0] === "t",
  },
  {
    nombre: "7. se puede pegar dos veces",
    tipo: "exito",
    sql: `${STUB}${MIGRACION}
select count(*) from information_schema.views where table_schema = 'retail' and table_name = 'planilla_por_sede';
rollback;`,
    verificar: (c) => Number(c[0]) === 1,
  },
];

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      continue;
    }
    const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK" && !l.startsWith("NOTICE") && !l.includes("planilla_por_sede:"));
    const columnas = filas[filas.length - 1].split("|");
    if (!caso.verificar(columnas)) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
