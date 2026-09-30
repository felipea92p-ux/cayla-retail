// Pruebas del candado de versiones de migración. Sin dependencias: `node --test scripts/migraciones/versiones.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { versionesRepetidas } from "./versiones.mjs";

// El choque real del 2026-09-30: #642 (Terminales) y #643 (Conteo) eligieron la misma versión, cada PR pasó su CI por
// su lado y `main` quedó con las dos.
const CHOQUE_2026_09_30 = [
  "20260930040000_conteo_alcance_por_lugar.sql",
  "20260930050000_conteo_ajuste_previo_en_la_nota.sql",
  "20260930050000_terminales_pasan_la_puerta_de_lectura.sql",
];

/** Corre el script contra una carpeta armada con esos nombres, como lo corre el CI contra supabase/migrations. */
function correr(nombres) {
  const dir = mkdtempSync(join(tmpdir(), "versiones-"));
  for (const n of nombres) writeFileSync(join(dir, n), "select 1;\n");
  const script = join(dirname(fileURLToPath(import.meta.url)), "versiones.mjs");
  const r = spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

test("sin versiones repetidas no devuelve nada", () => {
  assert.deepEqual(versionesRepetidas(["20260930050000_a.sql", "20260930050100_b.sql", "0000_local_stub_dynamic.sql"]), []);
});

test("el choque del 2026-09-30 sale con su versión y los dos archivos", () => {
  assert.deepEqual(versionesRepetidas(CHOQUE_2026_09_30), [
    ["20260930050000", ["20260930050000_conteo_ajuste_previo_en_la_nota.sql", "20260930050000_terminales_pasan_la_puerta_de_lectura.sql"]],
  ]);
});

test("el renombre que lo arregla (050000 → 050100) deja la carpeta limpia", () => {
  const arreglada = CHOQUE_2026_09_30.map((n) => n.replace("20260930050000_conteo", "20260930050100_conteo"));
  assert.deepEqual(versionesRepetidas(arreglada), []);
});

test("varios choques salen todos, ordenados por versión, y con tres archivos en una versión los nombra a los tres", () => {
  const r = versionesRepetidas(["20260930050000_c.sql", "20260917100000_a.sql", "20260930050000_d.sql", "20260917100000_b.sql", "20260930050000_e.sql"]);
  assert.deepEqual(r.map(([v]) => v), ["20260917100000", "20260930050000"]);
  assert.equal(r[1][1].length, 3);
});

test("lo que el CLI de Supabase no toma como migración no cuenta", () => {
  // Sin prefijo numérico, sin `_`, o que no termina en .sql (el stub de Dynamic vive como `.sql.example`).
  const otros = ["README.md", "0000_local_stub_dynamic.sql.example", "notas_20260930050000.sql", "20260930050000.sql", "20260930050000_a.sql"];
  assert.deepEqual(versionesRepetidas(otros), []);
});

test("el script sale con 1 y nombra los archivos cuando chocan, y con 0 cuando no", () => {
  const rojo = correr(CHOQUE_2026_09_30);
  assert.equal(rojo.codigo, 1, rojo.salida);
  assert.match(rojo.error, /20260930050000_conteo_ajuste_previo_en_la_nota\.sql/);
  assert.match(rojo.error, /20260930050000_terminales_pasan_la_puerta_de_lectura\.sql/);
  const verde = correr(["20260930050000_terminales_pasan_la_puerta_de_lectura.sql", "20260930050100_conteo_ajuste_previo_en_la_nota.sql"]);
  assert.equal(verde.codigo, 0, verde.error);
});
