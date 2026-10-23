// Pruebas de «qué toca el PR», de «qué corre en un push a main» (ADR-0345) y de «qué pruebas leen la web» (ADR-0259). `node --test scripts/ci/alcance.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clasificar, clasificarPush, compilaLaTienda, compilaLaWeb, vieneDeUnPr, yaProbado } from "./alcance.mjs";
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

// --- El push a main (ADR-0345) ---------------------------------------------------------------------------------------

test("un push viene de un PR si su asunto lo dice (squash o merge); un commit directo no", () => {
  assert.equal(vieneDeUnPr("feat(inventario): Existencias táctil — un icono por tarjeta (ADR-0344) (#819)"), true);
  assert.equal(vieneDeUnPr("Merge pull request #815 from felipea92p-ux/claude/catalog-product-modal-design-c2e80a"), true);
  // Directos de verdad: sin número de PR al final, o con un «(#12)» a media frase.
  assert.equal(vieneDeUnPr("docs(inventario): ADR-0328 y backlog — la ola 1 queda publicada"), false);
  assert.equal(vieneDeUnPr("fix(caja): corrige lo del (#12) y sigue"), false);
  assert.equal(vieneDeUnPr("Merge branch 'main' into claude/algo"), false);
  assert.equal(vieneDeUnPr(""), false);
});

test("push de un commit directo → todo corre, nadie lo revisó antes", () => {
  for (const archivos of [[], ["docs/a.md"], ["apps/web/lib/a.ts"], ["supabase/migrations/20261005000000_x.sql"]]) {
    const r = clasificarPush("docs(inventario): ADR-0328 y backlog", archivos);
    assert.equal(r.alcance, "completo");
    assert.equal(r.verificar, "si");
  }
});

test("push de un PR que ya corrió completo o solo documentos → nada que repetir", () => {
  for (const archivos of [["supabase/migrations/20261005000000_x.sql", "apps/web/lib/a.ts"], ["package.json"], ["docs/a.md", "CLAUDE.md"], []]) {
    const r = clasificarPush("feat(x): algo (#800)", archivos);
    assert.equal(r.alcance, "nada", archivos.join());
    assert.equal(r.verificar, "no", archivos.join());
  }
});

test("push de un PR «solo web» → Postgres ENTERO (la red del ADR-0259), pero sin repetir tipos, lint y pruebas", () => {
  const r = clasificarPush("Merge pull request #815 from x/y", ["apps/web/components/A.tsx", "docs/bitacora/x.md"]);
  assert.equal(r.alcance, "completo");
  assert.equal(r.verificar, "no");
});

test("el motivo siempre dice algo (sale en el log del CI)", () => {
  for (const [asunto, archivos] of [["x (#1)", []], ["x (#1)", ["apps/web/a.ts"]], ["x (#1)", ["package.json"]], ["x", []]]) {
    assert.ok(clasificarPush(asunto, archivos).motivo.length > 20);
  }
});

test("ci.yml: `Tipos, lint y pruebas` espera a «Qué toca el PR» y solo se salta con `verificar == 'no'`", () => {
  const yml = readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8");
  const verificar = yml.slice(yml.indexOf("  verificar:"), yml.indexOf("  pruebas-postgres:"));
  assert.match(verificar, /needs: alcance/);
  // `!cancelled()` y `!= 'no'`: si «Qué toca el PR» falla, su salida llega vacía y el job corre. Nunca se salta por no saber.
  assert.match(verificar, /if: \$\{\{ !cancelled\(\) && needs\.alcance\.outputs\.verificar != 'no' \}\}/);
  assert.match(yml, /verificar: \$\{\{ steps\.medir\.outputs\.verificar \}\}/);
});

test("compilar: la web, los paquetes, el lockfile y la versión de Node cambian `next build`; documentos, migraciones y scripts no", () => {
  for (const archivo of [
    "apps/web/lib/a.ts",
    "apps/web/next.config.ts",
    "packages/shared/src/index.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    ".nvmrc",
    ".github/workflows/ci.yml", // quien edite el job de compilar lo ve correr en su PR
  ]) {
    assert.equal(compilaLaWeb(["docs/a.md", archivo]), true, archivo);
  }
  for (const archivo of [
    "docs/adr/0407-x.md",
    "supabase/migrations/20261014000000_x.sql",
    "scripts/pruebas/x.mjs",
    ".github/workflows/sql-pegado.yml",
    "CLAUDE.md",
    "apps/webhooks/x.ts", // no es apps/web/
  ]) {
    assert.equal(compilaLaWeb([archivo]), false, archivo);
  }
  assert.equal(compilaLaWeb([]), false);
});

test("ci.yml: `Compila la web` espera a «Qué toca el PR», corre `next build` y solo se salta con `compilar == 'no'`", () => {
  const ci = readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8");
  const job = ci.slice(ci.indexOf("  compilar-web:"));
  assert.ok(job.includes("name: Compila la web"), "falta el job «Compila la web»");
  assert.match(job, /needs: alcance/);
  // `!= 'no'` y no `== 'si'`: si `alcance` falla su salida llega vacía y el job corre; nunca se salta por no saber.
  assert.match(job, /needs\.alcance\.outputs\.compilar != 'no'/);
  assert.match(job, /next build/);
});

test("compilar la tienda: la tienda y lo que comparten las dos apps; el ERP, documentos, migraciones y scripts no", () => {
  for (const archivo of [
    "apps/tienda/app/page.tsx",
    "apps/tienda/package.json",
    "packages/shared/src/index.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".nvmrc",
    ".github/workflows/ci.yml",
  ]) {
    assert.equal(compilaLaTienda(["docs/a.md", archivo]), true, archivo);
  }
  for (const archivo of ["apps/web/lib/a.ts", "docs/adr/0408-x.md", "supabase/migrations/20261014220000_x.sql", "scripts/pruebas/x.mjs"]) {
    assert.equal(compilaLaTienda([archivo]), false, archivo);
  }
  // La tienda no compila el ERP, pero su puerta son funciones de la base: Postgres corre entero.
  assert.equal(compilaLaWeb(["apps/tienda/app/page.tsx"]), false);
  assert.equal(clasificar(["apps/tienda/lib/base.ts"]), "completo");
});

test("ci.yml: `Compila la tienda` espera a «Qué toca el PR», compila apps/tienda y solo se salta con `compilar_tienda == 'no'`", () => {
  const ci = readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /compilar_tienda: \$\{\{ steps\.medir\.outputs\.compilar_tienda \}\}/);
  const job = ci.slice(ci.indexOf("  compilar-tienda:"));
  assert.ok(job.includes("name: Compila la tienda"), "falta el job «Compila la tienda»");
  assert.match(job, /needs: alcance/);
  assert.match(job, /needs\.alcance\.outputs\.compilar_tienda != 'no'/);
  assert.match(job, /pnpm --filter tienda build/);
});

// EL MISMO ÁRBOL YA PASÓ (ADR-0492): «Update branch» con `main` quieto no repite ~7 min de pruebas sobre los mismos archivos.

test("ya probado: solo un PR con la marca exacta (`true`) se salta; todo lo demás corre", () => {
  assert.equal(yaProbado("pull_request", "true"), true);
  for (const marca of [undefined, "", "false", "TRUE", "si"]) assert.equal(yaProbado("pull_request", marca), false, String(marca));
  // Un push a main tiene su propia regla (ADR-0345): la marca no lo toca.
  assert.equal(yaProbado("push", "true"), false);
});

function correrAlcance(env) {
  const salida = join(mkdtempSync(join(tmpdir(), "alcance-")), "salida");
  execFileSync(process.execPath, [join(RAIZ, "scripts", "ci", "alcance.mjs")], {
    cwd: RAIZ,
    env: { ...process.env, GITHUB_OUTPUT: salida, ...env },
    stdio: "pipe",
  });
  return Object.fromEntries(readFileSync(salida, "utf8").trim().split("\n").map((l) => l.split("=")));
}

test("con la marca, el script escribe nada/no en las cuatro salidas; sin ella, `verificar` sigue en `si`", () => {
  const conMarca = correrAlcance({ GITHUB_EVENT_NAME: "pull_request", YA_PROBADO: "true", ARBOL: "abc" });
  assert.deepEqual(conMarca, { alcance: "nada", verificar: "no", compilar: "no", compilar_tienda: "no" });
  const sinMarca = correrAlcance({ GITHUB_EVENT_NAME: "pull_request", YA_PROBADO: "" });
  assert.equal(sinMarca.verificar, "si");
});

test("ci.yml: la marca se busca y se guarda con la misma ruta y la misma llave, y solo tras una corrida verde de verdad", () => {
  const ci = readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8");
  const alcance = ci.slice(ci.indexOf("\n  alcance:"), ci.indexOf("\n  verificar:\n"));
  // La ruta entra en la «versión» de la caché: si difieren, la marca nunca se encuentra.
  assert.match(alcance, /actions\/cache\/restore@v4[\s\S]*path: \.ci-verde[\s\S]*key: ci-verde-\$\{\{ steps\.arbol\.outputs\.arbol \}\}[\s\S]*lookup-only: true/);
  assert.match(alcance, /YA_PROBADO: \$\{\{ steps\.ya-probado\.outputs\.cache-hit \}\}/);
  const marcar = ci.slice(ci.indexOf("  marcar-verde:"));
  assert.ok(marcar.includes("name: Anotar el árbol en verde"), "falta el job que deja la marca");
  assert.match(marcar, /actions\/cache\/save@v4[\s\S]*path: \.ci-verde[\s\S]*key: ci-verde-\$\{\{ needs\.alcance\.outputs\.arbol \}\}/);
  // Una corrida que se saltó por la marca no vuelve a marcar; una con un check rojo, tampoco.
  assert.match(marcar, /needs\.alcance\.outputs\.ya_probado != 'true'/);
  for (const job of ["verificar", "pruebas-postgres"]) assert.match(marcar, new RegExp(`needs\\.${job}\\.result == 'success'`), job);
  for (const job of ["compilar-web", "compilar-tienda"]) assert.match(marcar, new RegExp(`needs\\.${job}\\.result == 'skipped'`), job);
});
