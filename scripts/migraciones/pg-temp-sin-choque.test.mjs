// Pruebas del candado de ayudantes `pg_temp`. Sin dependencias: `node --test scripts/migraciones/pg-temp-sin-choque.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ayudantesPgTemp, choquesDePgTemp } from "./pg-temp-sin-choque.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "pg-temp-sin-choque.mjs");

const VIEJO = "create or replace function pg_temp.reemplazar_una_vez(p_firma text, p_viejo text, p_nuevo text, p_marca text)\nreturns void language plpgsql as $f$ begin null; end $f$;\n";
const ANCLA = "create or replace function pg_temp.reemplazar_una_vez(p_firma text, p_ancla text, p_nuevo text, p_marca text)\nreturns void language plpgsql as $f$ begin null; end $f$;\n";

test("el caso real del 2026-10-23: misma firma, otro nombre de parámetro → choque, con los dos archivos y sus líneas", () => {
  const choques = choquesDePgTemp([
    ["20261005160000_movimientos_colgada_y_guardada.sql", `-- cabecera\n${VIEJO}`],
    ["20261023212000_caja_registra_gastos_sin_finanzas.sql", `select 1;\n\n${ANCLA}`],
  ]);
  assert.equal(choques.length, 1);
  assert.equal(choques[0].funcion, "pg_temp.reemplazar_una_vez(text, text, text, text)");
  assert.deepEqual(choques[0].antes, { archivo: "20261005160000_movimientos_colgada_y_guardada.sql", linea: 2, nombres: ["p_firma", "p_viejo", "p_nuevo", "p_marca"] });
  assert.equal(choques[0].despues.archivo, "20261023212000_caja_registra_gastos_sin_finanzas.sql");
  assert.equal(choques[0].despues.linea, 3);
  assert.deepEqual(choques[0].despues.nombres, ["p_firma", "p_ancla", "p_nuevo", "p_marca"]);
});

test("el mismo ayudante con los mismos nombres en varias migraciones no choca (es lo que pasa hoy con p_viejo)", () => {
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", VIEJO], ["c.sql", VIEJO]]), []);
});

test("otro nombre de función, o los mismos nombres de parámetro con otros tipos, son firmas distintas: no chocan", () => {
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", ANCLA.replace("reemplazar_una_vez", "reemplazar_una_vez_ancla")]]), []);
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", ANCLA.replace("p_marca text", "p_marca integer")]]), []);
});

test("un drop function de esa firma entre las dos suelta el nombre viejo", () => {
  const suelta = "drop function if exists pg_temp.reemplazar_una_vez(text, text, text, text);\n";
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", suelta + ANCLA]]), []);
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", suelta], ["c.sql", ANCLA]]), []);
  // Sin paréntesis suelta todas las firmas de ese nombre; con los tipos de otra firma, no suelta esta.
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", "drop function pg_temp.reemplazar_una_vez;\n" + ANCLA]]), []);
  assert.equal(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", "drop function pg_temp.reemplazar_una_vez(text, text);\n" + ANCLA]]).length, 1);
});

test("el drop no sirve si viene DESPUÉS del create que choca: el motor ya falló", () => {
  assert.equal(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", ANCLA + "drop function pg_temp.reemplazar_una_vez(text, text, text, text);\n"]]).length, 1);
});

test("el choque también se da dentro de un mismo archivo", () => {
  assert.equal(choquesDePgTemp([["a.sql", VIEJO + "select 1;\n" + ANCLA]]).length, 1);
});

test("lo que no es una definición no cuenta: llamadas, comentarios y textos", () => {
  const sql = [
    "-- create or replace function pg_temp.reemplazar_una_vez(p_x text, p_y text, p_z text, p_w text)",
    "/* create function pg_temp.reemplazar_una_vez(a text) */",
    "select pg_temp.reemplazar_una_vez('retail.f()', 'a', 'b', 'c');",
    "create or replace function retail.reemplazar_una_vez(p_x text, p_y text, p_z text, p_w text) returns void language sql as $$ select 1 $$;",
  ].join("\n");
  assert.deepEqual(ayudantesPgTemp(sql), []);
  assert.deepEqual(choquesDePgTemp([["a.sql", VIEJO], ["b.sql", sql]]), []);
});

test("los tipos se comparan como los compara el motor: int = integer, numeric(12,2) = numeric, mayúsculas y espacios no importan", () => {
  const a = "create function pg_temp.f(p_a int, p_b numeric(12, 2), p_c timestamptz) returns void language sql as $$ select 1 $$;";
  const b = "CREATE OR REPLACE FUNCTION pg_temp.F(  p_x   INTEGER ,\n p_b NUMERIC,  p_c timestamp with time zone ) returns void language sql as $$ select 1 $$;";
  const choques = choquesDePgTemp([["a.sql", a], ["b.sql", b]]);
  assert.equal(choques.length, 1);
  assert.deepEqual(choques[0].despues.nombres, ["p_x", "p_b", "p_c"]);
});

test("un argumento sin nombre admite que la otra migración le ponga uno, pero uno con nombre no lo pierde ni lo cambia", () => {
  const sinNombre = "create function pg_temp.f(text, integer) returns void language sql as $$ select 1 $$;";
  const conNombre = "create or replace function pg_temp.f(p_a text, p_b integer) returns void language sql as $$ select 1 $$;";
  assert.deepEqual(choquesDePgTemp([["a.sql", sinNombre], ["b.sql", conNombre]]), []);
  assert.equal(choquesDePgTemp([["a.sql", conNombre], ["b.sql", sinNombre]]).length, 1);
});

test("un tipo de varias palabras sin nombre no se lee como «nombre = double»; OUT no entra en la firma; los defaults no rompen la lista", () => {
  const [f] = ayudantesPgTemp("create function pg_temp.g(double precision, p_b character varying(20) default 'a,b', out p_o text, variadic p_v text[]) returns record language sql as $$ select 1 $$;");
  assert.deepEqual(f.tipos, ["double precision", "character varying", "text[]"]);
  assert.deepEqual(f.nombres, ["", "p_b", "p_v"]);
});

test("las líneas reportadas son las del archivo, aunque haya comentarios de bloque encima", () => {
  const [f] = ayudantesPgTemp("/* uno\ndos\ntres */\ncreate function pg_temp.h(p_a text) returns void language sql as $$ select 1 $$;");
  assert.equal(f.linea, 4);
});

test("las migraciones reales del repo, en orden de versión, no tienen ningún choque", () => {
  const carpeta = join(RAIZ, "supabase", "migrations");
  const archivos = readdirSync(carpeta)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort()
    .map((n) => [n, readFileSync(join(carpeta, n), "utf8")]);
  assert.ok(archivos.length > 800, "no leyó las migraciones: ¿cambió la carpeta?");
  // Control de que el escáner no está ciego: ve los ayudantes que hay hoy.
  assert.ok(archivos.some(([, sql]) => ayudantesPgTemp(sql).length > 0), "el escáner no encontró ni un ayudante pg_temp");
  assert.deepEqual(choquesDePgTemp(archivos), []);
});

test("el script sale 0 en una carpeta limpia y 1 nombrando los dos archivos en una con choque", () => {
  const limpia = mkdtempSync(join(tmpdir(), "pgtemp-"));
  writeFileSync(join(limpia, "20260101000000_a.sql"), VIEJO);
  writeFileSync(join(limpia, "20260102000000_b.sql"), VIEJO);
  assert.equal(spawnSync("node", [SCRIPT, limpia], { encoding: "utf8" }).status, 0);

  const mala = mkdtempSync(join(tmpdir(), "pgtemp-"));
  writeFileSync(join(mala, "20260101000000_a.sql"), VIEJO);
  writeFileSync(join(mala, "20260102000000_b.sql"), ANCLA);
  writeFileSync(join(mala, "pegar-en-produccion-c.sql"), ANCLA.replace("p_ancla", "p_otro")); // no es migración: no cuenta
  const r = spawnSync("node", [SCRIPT, mala], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /20260101000000_a\.sql:1/);
  assert.match(r.stderr, /20260102000000_b\.sql:1/);
  assert.doesNotMatch(r.stderr, /pegar-en-produccion/);
});
