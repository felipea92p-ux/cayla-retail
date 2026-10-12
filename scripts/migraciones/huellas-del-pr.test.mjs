// Pruebas de `huellas-del-pr.mjs`: qué deja en la base cada migración nueva de un PR.
//   node --test scripts/migraciones/huellas-del-pr.test.mjs
// La parte pura corre siempre. La de punta a punta (aplicar migraciones de verdad y tomar huellas con deriva.sql) necesita
// un Postgres de juguete: HUELLAS_PSQL = el comando que abre psql contra una base VACÍA y desechable, por ejemplo
//   HUELLAS_PSQL="psql postgresql://localhost:55999/huellas"                                            (en tu máquina)
//   HUELLAS_PSQL="/usr/bin/docker exec -i supabase_db_cayla-retail psql -U postgres -d huellas_prueba"  (el CI)
// Sin la variable esas pruebas se saltan; en el CI las corre `pnpm pruebas:huellas-del-pr` (scripts/pruebas/huellas_del_pr.mjs)
// en una base aparte. Nunca la apuntes a la base de las pruebas ni a producción: la prueba crea y borra el schema `retail`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deltaPorArchivo, nuevasDelPr } from "./huellas-del-pr.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const mapa = (o) => new Map(Object.entries(o));

test("de lo que el PR agrega, solo las que Supabase aplica, en orden de versión", () => {
  assert.deepEqual(
    nuevasDelPr([
      "supabase/migrations/20261012120000_b.sql",
      "supabase/migrations/pegar-en-produccion-algo.sql",
      "supabase/migrations/20261012110000_a.sql",
      "supabase/seed.sql",
      "supabase/migrations/sub/20261012100000_c.sql",
    ]),
    ["supabase/migrations/20261012110000_a.sql", "supabase/migrations/20261012120000_b.sql"],
  );
});

test("cada archivo lista lo que cambió, con la huella FINAL; lo que borra, con null; solo datos, vacío", () => {
  const antes = mapa({ "fn\tviejo()": "v1", "fn\tse_va()": "x1", "columna\tt.a": "c1" });
  const pasos = [
    // 1: crea f, cambia viejo, borra se_va
    { archivo: "1_crea.sql", despues: mapa({ "fn\tviejo()": "v2", "fn\tf()": "f1", "columna\tt.a": "c1" }) },
    // 2: vuelve a cambiar f (la versión que vale es la de este)
    { archivo: "2_cambia.sql", despues: mapa({ "fn\tviejo()": "v2", "fn\tf()": "f2", "columna\tt.a": "c1" }) },
    // 3: solo datos
    { archivo: "3_datos.sql", despues: mapa({ "fn\tviejo()": "v2", "fn\tf()": "f2", "columna\tt.a": "c1" }) },
  ];
  assert.deepEqual(deltaPorArchivo(antes, pasos), [
    { archivo: "1_crea.sql", objetos: { "fn\tviejo()": "v2", "fn\tse_va()": null, "fn\tf()": "f2" } },
    { archivo: "2_cambia.sql", objetos: { "fn\tf()": "f2" } },
    { archivo: "3_datos.sql", objetos: {} },
  ]);
});

test("lo que un archivo crea y otro del mismo PR borra no se le exige a producción", () => {
  const antes = mapa({ "columna\tt.a": "c1" });
  const pasos = [
    { archivo: "1.sql", despues: mapa({ "columna\tt.a": "c1", "fn\ttemporal()": "t1" }) },
    { archivo: "2.sql", despues: mapa({ "columna\tt.a": "c1" }) },
  ];
  assert.deepEqual(deltaPorArchivo(antes, pasos), [
    { archivo: "1.sql", objetos: { "fn\ttemporal()": null } },
    { archivo: "2.sql", objetos: { "fn\ttemporal()": null } },
  ]);
});

test("sin migraciones no hay nada que listar", () => {
  assert.deepEqual(deltaPorArchivo(mapa({ "fn\tf()": "1" }), []), []);
});

test("apartar saca solo las migraciones que el PR agrega, y devolver las deja como estaban (repo de juguete)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "huellas-repo-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=prueba", "-c", "user.email=prueba@ejemplo", ...args], { cwd: raiz, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
  const carpeta = join(raiz, "supabase", "migrations");
  mkdirSync(carpeta, { recursive: true });
  git("init", "-q");
  writeFileSync(join(carpeta, "20260101000000_de_main.sql"), "select 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "main");
  // El «merge del PR»: dos migraciones nuevas, un .sql que Supabase no aplica y un cambio fuera de la carpeta.
  writeFileSync(join(carpeta, "20261012100100_b.sql"), "select 'b';\n");
  writeFileSync(join(carpeta, "20261012100000_a.sql"), "select 'a';\n");
  writeFileSync(join(carpeta, "pegar-en-produccion-algo.sql"), "select 'manual';\n");
  writeFileSync(join(raiz, "LEEME.md"), "x\n");
  git("add", ".");
  git("commit", "-q", "-m", "pr");
  const aparte = join(mkdtempSync(join(tmpdir(), "huellas-aparte-")), "pr");
  const correr = (...args) =>
    spawnSync(process.execPath, [join(AQUI, "huellas-del-pr.mjs"), ...args], { encoding: "utf8", env: { ...process.env, HUELLAS_RAIZ: raiz } });

  const apartar = correr("apartar", aparte);
  assert.equal(apartar.status, 0, apartar.stderr);
  assert.deepEqual(readdirSync(aparte).sort(), ["20261012100000_a.sql", "20261012100100_b.sql"]);
  assert.deepEqual(readdirSync(carpeta).sort(), ["20260101000000_de_main.sql", "pegar-en-produccion-algo.sql"], "supabase start ve solo lo de main");

  const devolver = correr("devolver", aparte);
  assert.equal(devolver.status, 0, devolver.stderr);
  assert.equal(git("status", "--porcelain"), "", "el árbol queda igual que el commit: las pruebas encuentran sus archivos");

  // Un PR sin migraciones no crea la carpeta (el CI no aplica nada).
  writeFileSync(join(raiz, "LEEME.md"), "y\n");
  git("commit", "-q", "-am", "solo docs");
  const vacio = join(mkdtempSync(join(tmpdir(), "huellas-vacio-")), "pr");
  assert.equal(correr("apartar", vacio).status, 0);
  assert.equal(existsSync(vacio), false);
});

// ── De punta a punta, contra un Postgres de juguete ────────────────────────────────────────────────────────────────

const PSQL = process.env.HUELLAS_PSQL;
// `pnpm pruebas:huellas-del-pr` pone HUELLAS_EXIGIR: ahí saltarse no es pasar.
if (process.env.HUELLAS_EXIGIR && !PSQL) throw new Error("HUELLAS_EXIGIR sin HUELLAS_PSQL: las pruebas de punta a punta no correrían.");
const conPostgres = { skip: PSQL ? false : "sin HUELLAS_PSQL (ver el encabezado)" };

/** Corre SQL en la base de juguete; devuelve las filas sin adornos (`-At`). */
function sql(texto) {
  const [cmd, ...args] = PSQL.split(" ");
  const r = spawnSync(cmd, [...args, "-At", "-q", "-v", "ON_ERROR_STOP=1"], { input: texto, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

/** Un `docker` falso que manda `docker exec -i <contenedor> psql -U postgres -d postgres …` a la base de juguete. */
function dockerFalso() {
  const dir = mkdtempSync(join(tmpdir(), "huellas-docker-"));
  writeFileSync(
    join(dir, "docker"),
    `#!/usr/bin/env bash\n# exec -i <contenedor> psql -U postgres -d postgres <resto>\nshift 7\nexec ${PSQL} "$@"\n`,
  );
  chmodSync(join(dir, "docker"), 0o755);
  return dir;
}

function preparar() {
  sql(`drop schema if exists retail cascade; drop schema if exists supabase_migrations cascade;
       create schema retail; create schema supabase_migrations;
       create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
       create table retail.t (id int primary key);
       create function retail.viejo() returns int language sql as 'select 1';`);
}

function aplicar(migraciones, { conHuellas = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "huellas-pr-"));
  mkdirSync(join(dir, "pr"));
  for (const [nombre, texto] of Object.entries(migraciones)) writeFileSync(join(dir, "pr", nombre), texto);
  const salida = conHuellas ? [join(dir, "huellas.json")] : [];
  const r = spawnSync(process.execPath, [join(AQUI, "huellas-del-pr.mjs"), "aplicar", join(dir, "pr"), ...salida], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dockerFalso()}:${process.env.PATH}` },
  });
  let json = null;
  try {
    json = JSON.parse(readFileSync(join(dir, "huellas.json"), "utf8"));
  } catch {}
  return { codigo: r.status, salida: r.stdout + r.stderr, json };
}

test("aplica cada migración en su orden y dice qué dejó cada una (Postgres real)", conPostgres, () => {
  preparar();
  const r = aplicar({
    "20990101000200_datos.sql": "insert into retail.t values (2);",
    "20990101000000_crea.sql": "create function retail.f() returns int language sql as 'select 1'; alter table retail.t add column nombre text;",
    "20990101000100_cambia.sql": "create or replace function retail.f() returns int language sql as 'select 2'; drop function retail.viejo(); insert into retail.t values (1);",
  });
  assert.equal(r.codigo, 0, r.salida);
  const porArchivo = Object.fromEntries(r.json.archivos.map((a) => [a.archivo, a.objetos]));
  assert.deepEqual(r.json.archivos.map((a) => a.archivo), ["20990101000000_crea.sql", "20990101000100_cambia.sql", "20990101000200_datos.sql"]);
  assert.ok("columna\tt.nombre" in porArchivo["20990101000000_crea.sql"]);
  assert.equal(porArchivo["20990101000000_crea.sql"]["fn\tf()"], porArchivo["20990101000100_cambia.sql"]["fn\tf()"], "las dos exigen la versión final de f");
  assert.equal(porArchivo["20990101000100_cambia.sql"]["fn\tviejo()"], null, "lo que borra no tiene que estar");
  assert.deepEqual(porArchivo["20990101000200_datos.sql"], {}, "solo datos: sin huella");
  assert.equal(sql("select count(*) from retail.t;").trim(), "2", "los datos se aplicaron");
  const historial = sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations;").trim();
  assert.equal(historial, "20990101000000,20990101000100,20990101000200", "quedan en el historial de Supabase");
});

test("cada archivo corre en su propia sesión y transacción, como el SQL Editor", conPostgres, () => {
  preparar();
  // El `set search_path` del primero no le llega al segundo: el segundo, sin prefijo, falla como fallaría en producción.
  const r = aplicar({
    "20990101000000_con_set.sql": "set search_path = retail; create function f() returns int language sql as 'select 1';",
    "20990101000100_sin_prefijo.sql": "create function g() returns int language sql as 'select f()';",
  });
  assert.notEqual(r.codigo, 0, "el segundo no encuentra f() sin el prefijo retail.");
  assert.equal(r.json, null, "si una migración falla, no hay huellas a medias");
  // Y una que falla a la mitad no deja nada (una transacción por archivo).
  preparar();
  const r2 = aplicar({ "20990101000000_a_medias.sql": "create function retail.h() returns int language sql as 'select 1'; select 1/0;" });
  assert.notEqual(r2.codigo, 0);
  assert.equal(sql("select count(*) from pg_proc where proname = 'h';").trim(), "0", "nada a medias");
});

test("sin archivo de salida (tandas 2 a 4 del CI) solo aplica: la base queda igual y no hay huellas", conPostgres, () => {
  preparar();
  const r = aplicar({ "20990101000000_crea.sql": "create function retail.f() returns int language sql as 'select 1';" }, { conHuellas: false });
  assert.equal(r.codigo, 0, r.salida);
  assert.equal(r.json, null);
  assert.equal(sql("select count(*) from pg_proc where proname = 'f' and pronamespace = 'retail'::regnamespace;").trim(), "1");
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations;").trim(), "1");
});
