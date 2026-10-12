// Pruebas de «¿Vercel construye esta versión?» (ADR-0383). `node --test scripts/ci/vercel-ignorar.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decidir } from "./vercel-ignorar.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const vistaPrevia = (mensaje) => decidir({ entorno: "preview", mensaje }).construir;

// Asuntos copiados del historial real (`git log --merges --format=%s`, 2026-10-12).
const TRAEN_MAIN = [
  "Merge branch 'main' into claude/analisis-celda-ventas-arriba",
  "Merge remote-tracking branch 'origin/main' into claude/inventario-788-rescate",
  "Merge branch 'main' of https://github.com/felipea92p-ux/cayla-retail into claude/sales-module-corrections-e62083",
  "Merge origin/main",
  "Merge origin/main into claude/purchase-order-redesign-9b0c82",
  "Merge origin/main en claude/subir-a-almacen-por-prenda",
  "merge: origin/main en claude/panel-comercial",
  "merge: trae origin/main al día",
  "merge: actualiza la rama con main",
];

const TRAEN_ALGO_PROPIO = [
  "fix(analisis): en la tabla del modelo, lo vendido siempre arriba y lo que no hay al final",
  "docs(cambios): renumera el ADR a 0380 y anota la publicación de la web",
  // Ponerse al día con la MISMA rama en el remoto: puede traer commits con código de otra máquina.
  "Merge remote-tracking branch 'origin/claude/analisis-mas-vendido-y-barras' into claude/analisis-mas-vendido-y-barras",
  "Merge branch 'claude/sales-module-corrections-e62083' of https://github.com/felipea92p-ux/cayla-retail into claude/sales-module-corrections-e62083",
  "Merge pull request #973 from felipea92p-ux/claude/purchase-order-redesign-9b0c82",
  // Una rama cuyo nombre empieza con «main» no es `main`.
  "Merge branch 'claude/main-menu' into claude/otra",
  "Merge branch 'maintenance' into claude/otra",
  "merge: trae claude/main-menu",
  // Dice «main» pero no es un merge.
  "fix(menu): el main de la cabecera ya no salta",
];

test("vista previa que solo trae main → no se construye", () => {
  for (const asunto of TRAEN_MAIN) assert.equal(vistaPrevia(asunto), false, asunto);
});

test("vista previa con algo propio de la rama → se construye", () => {
  for (const asunto of TRAEN_ALGO_PROPIO) assert.equal(vistaPrevia(asunto), true, asunto);
});

test("producción se construye siempre, aunque el asunto sea un merge de main", () => {
  for (const asunto of TRAEN_MAIN) assert.equal(decidir({ entorno: "production", mensaje: asunto }).construir, true, asunto);
});

test("ante la duda se construye: entorno desconocido o sin dato, mensaje vacío", () => {
  const merge = TRAEN_MAIN[0];
  assert.equal(decidir({ entorno: undefined, mensaje: merge }).construir, true);
  assert.equal(decidir({ entorno: "", mensaje: merge }).construir, true);
  assert.equal(decidir({ entorno: "development", mensaje: merge }).construir, true);
  assert.equal(vistaPrevia(undefined), true);
  assert.equal(vistaPrevia(""), true);
  assert.equal(vistaPrevia("   \n\n"), true);
});

test("solo cuenta la primera línea del mensaje", () => {
  // Un merge con conflictos resueltos conserva el asunto de git.
  assert.equal(vistaPrevia("Merge branch 'main' into claude/x\n\n# Conflicts:\n#\tapps/web/lib/a.ts\n"), false);
  // Un commit con código que menciona el merge en el cuerpo sigue siendo un commit con código.
  assert.equal(vistaPrevia("fix(caja): cuadra el fondo\n\nMerge branch 'main' into claude/x"), true);
});

// El contrato con Vercel es el código de salida: 0 = ignorar, 1 = construir.
function salida(env, cwd = RAIZ) {
  const r = spawnSync(process.execPath, [join(RAIZ, "scripts/ci/vercel-ignorar.mjs")], {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
  return r.status;
}

test("código de salida: 0 solo para una vista previa que trae main", () => {
  assert.equal(salida({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_MESSAGE: TRAEN_MAIN[1] }), 0);
  assert.equal(salida({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_MESSAGE: TRAEN_ALGO_PROPIO[0] }), 1);
  assert.equal(salida({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: TRAEN_MAIN[1] }), 1);
  assert.equal(salida({}), 1);
});

test("apps/web/vercel.json llama a este script y la orden funciona desde apps/web y desde la raíz", () => {
  const { ignoreCommand } = JSON.parse(readFileSync(join(RAIZ, "apps/web/vercel.json"), "utf8"));
  assert.match(ignoreCommand, /scripts\/ci\/vercel-ignorar\.mjs/);
  for (const cwd of [join(RAIZ, "apps/web"), RAIZ]) {
    const correr = (env) =>
      spawnSync("sh", ["-c", ignoreCommand], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" }).status;
    assert.equal(correr({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_MESSAGE: TRAEN_MAIN[0] }), 0, cwd);
    assert.equal(correr({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: TRAEN_MAIN[0] }), 1, cwd);
  }
});
