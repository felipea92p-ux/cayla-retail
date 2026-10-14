// Pruebas del candado «probado = en pantalla» (ADR-0406, act. 2026-10-14). `node --test scripts/knip/produccion.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compararConDeuda, hallazgosDe } from "./produccion.mjs";
import { DEUDA } from "./deuda-produccion.mjs";

// La forma de `knip --reporter json` (6.41.0): una entrada por archivo, con una lista por tipo de problema.
const vacio = { binaries: [], dependencies: [], duplicates: [], enumMembers: [], exports: [], files: [], types: [], unlisted: [] };
const informe = {
  issues: [
    { ...vacio, file: "apps/web/lib/codigo128.ts", files: [{ name: "apps/web/lib/codigo128.ts" }] },
    {
      ...vacio,
      file: "apps/web/lib/marcas.ts",
      exports: [
        { name: "filtrarMarcas", line: 180, col: 17, pos: 1 },
        { name: "buscarMarcaProveedor", line: 79, col: 17, pos: 2 },
      ],
      types: [{ name: "FiltroViejo", line: 3, col: 1, pos: 3 }],
    },
    { ...vacio, file: "apps/web/package.json", dependencies: [{ name: "gsap", line: 33, col: 6, pos: 4 }] },
  ],
};

test("cada hallazgo es un texto estable: archivo, archivo: nombre, o archivo: nombre (tipo)", () => {
  assert.deepEqual(hallazgosDe(informe), [
    "apps/web/lib/codigo128.ts",
    "apps/web/lib/marcas.ts: FiltroViejo (types)",
    "apps/web/lib/marcas.ts: buscarMarcaProveedor",
    "apps/web/lib/marcas.ts: filtrarMarcas",
    "apps/web/package.json: gsap (dependencies)",
  ]);
});

test("sin hallazgos (Knip en limpio) da una lista vacía", () => {
  assert.deepEqual(hallazgosDe({ issues: [] }), []);
});

test("una pieza nueva sin pantalla es un hallazgo nuevo; una de la deuda que ya no aparece hay que sacarla", () => {
  const deuda = ["apps/web/lib/codigo128.ts", "apps/web/lib/marcas.ts: filtrarMarcas", "apps/web/lib/viejo.ts: yaSeBorro"];
  const r = compararConDeuda(["apps/web/lib/codigo128.ts", "apps/web/lib/marcas.ts: filtrarMarcas", "apps/web/lib/nuevo.ts: sinPantalla"], deuda);
  assert.deepEqual(r.nuevos, ["apps/web/lib/nuevo.ts: sinPantalla"]);
  assert.deepEqual(r.yaNoEstan, ["apps/web/lib/viejo.ts: yaSeBorro"]);
  assert.deepEqual(r.repetidos, []);
});

test("la deuda que repite una línea se nota", () => {
  assert.deepEqual(compararConDeuda(["a.ts: x"], ["a.ts: x", "a.ts: x"]).repetidos, ["a.ts: x"]);
});

test("la deuda real no repite ninguna línea y cada una tiene la forma de un hallazgo", () => {
  assert.equal(new Set(DEUDA).size, DEUDA.length);
  for (const d of DEUDA) assert.match(d, /^apps\/web\/lib\/[\w/.-]+\.tsx?(: \w+)?$/, d);
});
