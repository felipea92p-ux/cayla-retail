// Pruebas de «qué toca el PR» y de «qué pruebas leen la web» (ADR-0259). `node --test scripts/ci/alcance.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clasificar } from "./alcance.mjs";
import { leeLaWeb, pruebasQueLeenLaWeb } from "./pruebas-web.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("solo documentos → nada", () => {
  assert.equal(clasificar(["docs/bitacora/2026-09-29-x.md", "CLAUDE.md", "supabase/README.md", ".claude/skills/a/SKILL.md"]), "nada");
});

test("sin archivos → nada", () => {
  assert.equal(clasificar([]), "nada");
});

test("pantallas (con o sin documentos) → web", () => {
  assert.equal(clasificar(["apps/web/components/ProductoForm.tsx"]), "web");
  assert.equal(clasificar(["docs/backlog/2026-09-29-x.md", "apps/web/lib/a.ts", "apps/web/package.json"]), "web");
});

test("cualquier cosa fuera de la web y los documentos → completo, aunque venga con pantallas", () => {
  for (const archivo of [
    "supabase/migrations/20260929000000_x.sql",
    "scripts/pruebas/x.mjs",
    "packages/database/src/types.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    ".nvmrc",
    "algo-nuevo/que-nadie-conoce.ts",
  ]) {
    assert.equal(clasificar(["apps/web/lib/a.ts", archivo]), "completo", archivo);
  }
});

test("una prueba que lee la web por ruta, por partes o por un import en cadena se detecta", () => {
  const archivos = {
    "/r/a.mjs": 'readFileSync(new URL("../../apps/web/lib/x.json", import.meta.url))',
    "/r/b.mjs": 'const WEB = join(RAIZ, "apps", "web");',
    "/r/c.mjs": 'import { f } from "./ayuda.mjs";',
    "/r/ayuda.mjs": 'import { g } from "../otra/reglas.mjs";',
    "/otra/reglas.mjs": 'export * from "../../apps/web/lib/reglas.ts";',
    "/r/d.mjs": 'import { f } from "./ciclo.mjs"; const x = "supabase";',
    "/r/ciclo.mjs": 'import "./d.mjs";',
  };
  const leer = (ruta) => archivos[ruta] ?? null;
  assert.equal(leeLaWeb("/r/a.mjs", leer), true);
  assert.equal(leeLaWeb("/r/b.mjs", leer), true);
  assert.equal(leeLaWeb("/r/c.mjs", leer), true);
  assert.equal(leeLaWeb("/r/d.mjs", leer), false, "un ciclo de imports no se cuelga ni inventa");
});

test("un script de pruebas que no es `node archivo.mjs` se trata como que lee la web (hacia correr de más)", () => {
  const leer = () => "nada de la web";
  const scripts = { "pruebas:a": "node scripts/pruebas/a.mjs", "pruebas:b": "bash raro.sh", build: "next build" };
  assert.deepEqual(pruebasQueLeenLaWeb(scripts, "/r", leer), ["pruebas:b"]);
});

test("en el repo de hoy: las tres que leen la web, y solo pocas", () => {
  const leer = (ruta) => (existsSync(ruta) ? readFileSync(ruta, "utf8") : null);
  const { scripts } = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const nombres = pruebasQueLeenLaWeb(scripts, RAIZ, leer);
  for (const esperada of ["pruebas:roles-cobertura", "pruebas:frescura-lectura", "pruebas:fn-movimientos-busqueda-especial"]) {
    assert.ok(nombres.includes(esperada), `${esperada} lee apps/web y debería estar`);
  }
  assert.ok(nombres.length < 15, `se detectaron ${nombres.length}: el modo «web» ya no ahorraría tiempo, revisar`);
});
