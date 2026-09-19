// Pruebas del candado de números de ADR. Sin dependencias: `node --test scripts/adr/numeros.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { legadoDeSobra, numerosRepetidos } from "./numeros.mjs";

test("dos archivos con el mismo número se reportan, con sus nombres", () => {
  assert.deepEqual(numerosRepetidos(["0001-a.md", "0002-b.md", "0002-c.md"], {}), [["0002", ["0002-b.md", "0002-c.md"]]]);
});

test("lo que no es un ADR numerado no cuenta", () => {
  assert.deepEqual(numerosRepetidos(["README.md", "plantilla.md", "0001-a.md", "12-x.md", "12-y.md", "0003-notas.txt"], {}), []);
});

test("un duplicado del legado se tolera, pero no puede crecer", () => {
  const legado = { "0074": 2 };
  assert.deepEqual(numerosRepetidos(["0074-a.md", "0074-b.md"], legado), []);
  assert.deepEqual(numerosRepetidos(["0074-a.md", "0074-b.md", "0074-c.md"], legado), [["0074", ["0074-a.md", "0074-b.md", "0074-c.md"]]]);
});

test("un número que no es del legado falla con dos archivos aunque el legado tenga otros", () => {
  assert.equal(numerosRepetidos(["0100-a.md", "0100-b.md"], { "0074": 2 }).length, 1);
});

test("una línea de legado que ya no está repetida se avisa como sobrante", () => {
  assert.deepEqual(legadoDeSobra(["0074-a.md", "0074-b.md", "0102-a.md"], { "0074": 2, "0102": 2 }), ["0102"]);
});
