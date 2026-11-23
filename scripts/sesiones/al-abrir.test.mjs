// El hook de inicio de sesión del tablero (ADR-0697) nunca traba la sesión: fuera de un repo calla y sale con 0. Corre con
// `node --test` (CI, «Tablero de sesiones»). Lo que dice cuando sí hay sesiones lo prueba `reglas.test.mjs` (`resumenAlAbrir`).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "al-abrir.mjs");

test("fuera de un repo git calla, sale con 0 y a tiempo", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "sesiones-sin-repo-"));
  try {
    const inicio = Date.now();
    const r = spawnSync(process.execPath, [HOOK], { cwd: carpeta, env: { ...process.env, CLAUDE_PROJECT_DIR: carpeta, GIT_CEILING_DIRECTORIES: dirname(carpeta) }, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.ok(Date.now() - inicio < 8000, "nunca pasa su tope");
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});
