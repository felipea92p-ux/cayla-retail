#!/usr/bin/env node
/**
 * Prueba del candado de partes (`scripts/migraciones/partes-sin-deadlock.mjs`, ADR-0195 act. 2026-11-23) contra un Postgres
 * de Supabase de verdad.
 *
 * EL PROBLEMA. La regla «una parte que se pega sola no mezcla una política con el `alter` de una tabla que ya existía» solo
 * se puede comprobar midiendo: es `supautils` (`policy_grants`) el que, con cada política, toma en exclusiva las tablas de
 * `auth` y `storage`. Las pruebas puras del candado (`partes-sin-deadlock.test.mjs`) usan fotos de juguete; esta mira que
 * la base del CI de verdad haga lo que esas fotos suponen, y que el candado lo lea bien.
 *
 * QUÉ CUBRE
 *   1. El canario: una política toma `auth`/`storage` en este Postgres. Si un día deja de hacerlo (otra imagen, otro
 *      `supautils`), el candado quedaría ciego y siempre verde: esta prueba se pone roja para que alguien lo mire.
 *   2. `alter table retail.ubicaciones …` y después `create policy` en la misma parte: rojo, con `retail.ubicaciones` y sus
 *      líneas.
 *   3. Lo mismo con una marca `-- ===== PARTE 2 · políticas =====` en medio: verde.
 *   4. Una política sola sobre una tabla en uso, y dos seguidas: verde (es la forma correcta).
 *   5. La política primero y después el `alter` de otra tabla en uso: verde. Con `storage.buckets` ya en exclusiva, el Asesor
 *      no puede tenerlo; el ciclo de F1 necesita la tabla tomada ANTES de la política.
 *   6. `lock table … in access exclusive mode` + `drop policy if exists` de una que no existe: rojo (el `drop` vacío también
 *      toma `auth`/`storage`, medido el 2026-09-24 y el 2026-11-23).
 *   7. Una tabla nueva con su RLS y su política, y un `comment on` de una tabla en uso: verde (lo nuevo no lo ve nadie; el
 *      comentario no la toma en exclusiva).
 *   8. Medir no deja nada: ni la columna, ni la política, ni la tabla.
 *
 * CÓMO. Cada medida corre en `begin … rollback` (es lo que hace el candado), como `postgres`, el rol del SQL Editor.
 *
 * USO
 *   pnpm pruebas:partes-sin-deadlock    → con el Postgres local arriba (`supabase_db_cayla-retail`)
 */
import { execFileSync } from "node:child_process";
import { medirMigracion, psqlEn, reproduceElBloqueo } from "../migraciones/partes-sin-deadlock.mjs";

const CONTENEDOR = "supabase_db_cayla-retail";
const psql = psqlEn(CONTENEDOR);

let fallas = 0;
function caso(nombre, fn) {
  try {
    fn();
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.message ?? e).split("\n").join("\n    ")}`);
  }
}
function igual(real, esperado, que) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${que}: esperaba ${b}, salió ${a}`);
}
/** Las relaciones culpables de cada parte que mezcla: `[[etiqueta, [relación@línea…], [línea de la política…]]]`. */
const mezclas = (sql) => {
  const r = medirMigracion(sql, psql);
  if (r.sinMedir) throw new Error(`no se midió: ${r.sinMedir}`);
  return r.mezclas.map((m) => [m.etiqueta, m.otras.map((o) => `${o.relacion}@${o.linea}`), m.politicas.map((p) => p.linea)]);
};
const consulta = (sql) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();

caso("1. el canario: una política toma auth/storage en este Postgres (si no, el candado está ciego)", () => {
  if (!reproduceElBloqueo(psql)) {
    throw new Error("Este Postgres ya no toma auth/storage con una política: revisa supautils.policy_grants y ADR-0195 (act. 2026-11-23).");
  }
});

caso("2. alter de retail.ubicaciones y después create policy en la misma parte: rojo, con su tabla y sus líneas", () => {
  igual(
    mezclas("alter table retail.ubicaciones add column cayla_prueba_partes int;\ncreate policy cayla_prueba_partes on retail.ubicaciones for select using (true);\n"),
    [["el archivo entero", ["retail.ubicaciones@1"], [2]]],
    "mezclas",
  );
});

caso("3. lo mismo con la política en su propia parte: verde", () => {
  igual(
    mezclas([
      "-- ============================== PARTE 1 · ubicaciones (sola) ==============================",
      "set lock_timeout = '3s';",
      "alter table retail.ubicaciones add column cayla_prueba_partes int;",
      "-- ============================== PARTE 2 · políticas (solas y al final) ==============================",
      "set lock_timeout = '3s';",
      "create policy cayla_prueba_partes on retail.ubicaciones for select using (true);",
    ].join("\n")),
    [],
    "mezclas",
  );
});

caso("4. una política sola sobre una tabla en uso, y dos seguidas: verde", () => {
  igual(mezclas("create policy cayla_prueba_partes on retail.ubicaciones for select using (true);"), [], "una");
  igual(
    mezclas("create policy cayla_prueba_partes on retail.ubicaciones for select using (true);\ncreate policy cayla_prueba_partes on retail.cajas for select using (true);"),
    [],
    "dos",
  );
});

caso("5. la política primero y después el alter de otra tabla en uso: verde (el Asesor ya no puede tener storage)", () => {
  igual(
    mezclas("create policy cayla_prueba_partes on retail.ubicaciones for select using (true);\nalter table retail.cajas add column cayla_prueba_partes int;"),
    [],
    "mezclas",
  );
});

caso("6. lock table en exclusiva + drop policy if exists de una que no existe: rojo", () => {
  igual(
    mezclas("lock table retail.cajas in access exclusive mode;\ndrop policy if exists cayla_no_existe on retail.ubicaciones;"),
    [["el archivo entero", ["retail.cajas@1"], [2]]],
    "mezclas",
  );
});

caso("7. una tabla nueva con su RLS y su política, y un comment on de una tabla en uso: verde", () => {
  igual(
    mezclas([
      "comment on table retail.ubicaciones is 'cayla prueba partes';",
      "create table retail.cayla_prueba_partes (id int primary key);",
      "alter table retail.cayla_prueba_partes enable row level security;",
      "create policy cayla_prueba_partes on retail.cayla_prueba_partes for select using (true);",
    ].join("\n")),
    [],
    "mezclas",
  );
});

caso("8. medir no deja nada: ni la columna, ni las políticas, ni la tabla", () => {
  igual(
    consulta(`select
      (select count(*) from information_schema.columns where table_schema = 'retail' and column_name = 'cayla_prueba_partes'),
      (select count(*) from pg_policies where policyname = 'cayla_prueba_partes'),
      (select count(*) from pg_class where relname = 'cayla_prueba_partes');`),
    "0|0|0",
    "rastros",
  );
});

if (fallas > 0) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nEl candado de partes lee bien el Postgres de Supabase.");
