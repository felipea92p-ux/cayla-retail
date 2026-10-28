// Pruebas de «¿Vercel construye esta versión?» (ADR-0383). `node --test scripts/ci/vercel-ignorar.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asuntosDesde, decidir, traeMain } from "./vercel-ignorar.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(RAIZ, "scripts/ci/vercel-ignorar.mjs");

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

test("reconoce los merges que traen main, y nada más", () => {
  for (const asunto of TRAEN_MAIN) assert.equal(traeMain(asunto), true, asunto);
  for (const asunto of TRAEN_ALGO_PROPIO) assert.equal(traeMain(asunto), false, asunto);
});

const vistaPrevia = (asuntos) => decidir({ entorno: "preview", asuntos }).construir;

test("vista previa: se salta solo si TODO lo sumado desde la última versión construida trae main", () => {
  assert.equal(vistaPrevia([TRAEN_MAIN[0]]), false);
  assert.equal(vistaPrevia([TRAEN_MAIN[1], TRAEN_MAIN[0]]), false);
  // El hueco del 2026-10-12: el commit con código quedó cancelado en la fila y el merge de main lo reemplazó.
  assert.equal(vistaPrevia([TRAEN_MAIN[0], TRAEN_ALGO_PROPIO[0]]), true);
  assert.equal(vistaPrevia([TRAEN_ALGO_PROPIO[0]]), true);
});

test("producción se construye siempre, aunque solo traiga main", () => {
  assert.equal(decidir({ entorno: "production", asuntos: [TRAEN_MAIN[0]] }).construir, true);
});

test("ante la duda se construye: entorno sin dato, sin versión anterior, misma versión", () => {
  assert.equal(decidir({ entorno: undefined, asuntos: [TRAEN_MAIN[0]] }).construir, true);
  assert.equal(decidir({ entorno: "development", asuntos: [TRAEN_MAIN[0]] }).construir, true);
  assert.equal(vistaPrevia(null), true);
  assert.equal(vistaPrevia([]), true);
});

// Un repo de verdad con la historia típica de una rama: código, y después dos veces «traer main».
function repoDePrueba() {
  const dir = mkdtempSync(join(tmpdir(), "vercel-ignorar-"));
  const g = (...args) =>
    execFileSync("git", ["-c", "user.name=Prueba", "-c", "user.email=prueba@cayla.test", "-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  const commit = (asunto) => {
    g("commit", "-q", "--allow-empty", "-m", asunto);
    return g("rev-parse", "HEAD");
  };
  g("init", "-q", "-b", "main");
  const base = commit("base");
  g("checkout", "-q", "-b", "claude/x");
  const codigo = commit("fix(caja): cuadra el fondo");
  g("checkout", "-q", "main");
  commit("feat(compras): algo que entró a main");
  g("checkout", "-q", "claude/x");
  g("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into claude/x", "main");
  const merge1 = g("rev-parse", "HEAD");
  g("checkout", "-q", "main");
  commit("feat(analisis): otra cosa en main");
  g("checkout", "-q", "claude/x");
  g("merge", "-q", "--no-ff", "-m", "Merge remote-tracking branch 'origin/main' into claude/x", "main");
  const head = g("rev-parse", "HEAD");
  return { dir, base, codigo, merge1, head };
}

test("asuntosDesde sigue el primer padre: lo que trajo cada merge de main no cuenta como propio", (t) => {
  const r = repoDePrueba();
  t.after(() => rmSync(r.dir, { recursive: true, force: true }));
  assert.deepEqual(asuntosDesde(r.codigo, r.dir), [
    "Merge remote-tracking branch 'origin/main' into claude/x",
    "Merge branch 'main' into claude/x",
  ]);
  assert.deepEqual(asuntosDesde(r.base, r.dir), [
    "Merge remote-tracking branch 'origin/main' into claude/x",
    "Merge branch 'main' into claude/x",
    "fix(caja): cuadra el fondo",
  ]);
  assert.deepEqual(asuntosDesde(r.head, r.dir), []);
  assert.equal(asuntosDesde("", r.dir), null);
  assert.equal(asuntosDesde(undefined, r.dir), null);
  // Una versión anterior que el clon no tiene (clon corto, rama reescrita): no se sabe.
  assert.equal(asuntosDesde("0123456789abcdef0123456789abcdef01234567", r.dir), null);
});

// El contrato con Vercel es el código de salida: 0 = ignorar, 1 = construir.
function salida(cwd, env) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" }).status;
}

test("código de salida en un repo de verdad", (t) => {
  const r = repoDePrueba();
  t.after(() => rmSync(r.dir, { recursive: true, force: true }));
  const preview = (anterior) => salida(r.dir, { VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: anterior });
  assert.equal(preview(r.codigo), 0, "el código ya estaba construido: los dos merges se saltan");
  assert.equal(preview(r.merge1), 0, "desde el primer merge solo vino otro merge");
  assert.equal(preview(r.base), 1, "el código nunca se construyó (quedó cancelado en la fila)");
  assert.equal(preview(r.head), 1, "repetir la misma versión");
  assert.equal(preview(""), 1, "primera versión de la rama");
  assert.equal(preview("0123456789abcdef0123456789abcdef01234567"), 1, "versión anterior fuera del clon");
  assert.equal(salida(r.dir, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: r.codigo }), 1, "producción");
  assert.equal(salida(r.dir, {}), 1, "sin variables de Vercel");
});

test("la orden de apps/web/vercel.json encuentra el script desde apps/web y desde la raíz del clon", (t) => {
  const { ignoreCommand } = JSON.parse(readFileSync(join(RAIZ, "apps/web/vercel.json"), "utf8"));
  assert.match(ignoreCommand, /scripts\/ci\/vercel-ignorar\.mjs/);
  // Un clon de mentira con el script en su lugar: así se prueba la orden tal cual la corre Vercel.
  const r = repoDePrueba();
  t.after(() => rmSync(r.dir, { recursive: true, force: true }));
  mkdirSync(join(r.dir, "scripts/ci"), { recursive: true });
  mkdirSync(join(r.dir, "apps/web"), { recursive: true });
  copyFileSync(SCRIPT, join(r.dir, "scripts/ci/vercel-ignorar.mjs"));
  for (const cwd of [join(r.dir, "apps/web"), r.dir]) {
    const correr = (env) => spawnSync("sh", ["-c", ignoreCommand], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
    const salta = correr({ VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: r.codigo });
    assert.equal(salta.status, 0, `${cwd}: ${salta.stdout}${salta.stderr}`);
    assert.match(salta.stdout, /No se construye: .*\(ADR-0383\)/);
    assert.equal(correr({ VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: r.codigo }).status, 1, cwd);
  }
});
