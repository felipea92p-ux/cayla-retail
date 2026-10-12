// Pruebas del reparto en tandas (ADR-0381). Solo leen archivos: corren en «Tipos, lint y pruebas», sin Docker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { leerTanda, PRUEBAS, repartir, TANDAS } from "./pruebas-postgres.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const duraciones = JSON.parse(readFileSync(join(RAIZ, "scripts", "ci", "pruebas-postgres-duraciones.json"), "utf8"));
const scripts = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")).scripts;

test("la lista no repite ninguna prueba y cada una existe en package.json", () => {
  assert.equal(new Set(PRUEBAS).size, PRUEBAS.length, "una prueba repetida correría dos veces y descuadraría el reparto");
  assert.ok(PRUEBAS.length > 150, "la lista se leyó entera");
  for (const p of PRUEBAS) assert.ok(p in scripts, `\`${p}\` está en la lista pero package.json no lo declara`);
});

test("cada prueba cae en exactamente una tanda (ninguna se pierde, ninguna corre dos veces)", () => {
  for (const de of [1, 2, 3, TANDAS, 7]) {
    const tandas = repartir(PRUEBAS, duraciones, de);
    assert.equal(tandas.length, de);
    assert.deepEqual([...tandas.flat()].sort(), [...PRUEBAS].sort());
  }
});

test("el reparto es determinista y cada tanda conserva el orden de la lista", () => {
  assert.deepEqual(repartir(PRUEBAS, duraciones, TANDAS), repartir([...PRUEBAS], { ...duraciones }, TANDAS));
  for (const tanda of repartir(PRUEBAS, duraciones, TANDAS)) {
    const posiciones = tanda.map((p) => PRUEBAS.indexOf(p));
    assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  }
});

test("las tandas duran parecido: la diferencia no pasa de la prueba más larga", () => {
  const tandas = repartir(PRUEBAS, duraciones, TANDAS);
  const totales = tandas.map((t) => t.reduce((s, p) => s + (duraciones[p] ?? 3), 0));
  const masLarga = Math.max(...Object.values(duraciones));
  assert.ok(Math.max(...totales) - Math.min(...totales) <= masLarga, `totales ${totales.join(", ")}`);
});

test("una prueba sin medir entra igual, con la mediana", () => {
  const tandas = repartir(["a", "b", "nueva"], { a: 10, b: 2 }, 2);
  assert.deepEqual([...tandas.flat()].sort(), ["a", "b", "nueva"]);
});

test("las duraciones solo nombran pruebas de la lista (una vieja se borra con --medir)", () => {
  for (const p of Object.keys(duraciones)) assert.ok(PRUEBAS.includes(p), `\`${p}\` tiene duración pero ya no está en la lista`);
});

test("--tanda rechaza lo que no es N/T válido, para no correr cero pruebas en verde", () => {
  assert.deepEqual(leerTanda("2/4"), { n: 2, de: 4 });
  for (const malo of [undefined, "", "0/4", "5/4", "2", "a/b", "2/0"]) assert.throws(() => leerTanda(malo));
});

test("ci.yml corre las mismas tandas que TANDAS y el check obligatorio conserva su nombre", () => {
  const yml = readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8");
  // El ruleset `main-protegida` exige un check llamado exactamente así: si cambia, ningún PR se puede fusionar.
  assert.match(yml, /\n {4}name: Pruebas de RPC contra Postgres\n/);
  assert.match(yml, new RegExp(`'\\[${Array.from({ length: TANDAS }, (_, i) => i + 1).join(",")}\\]'`));
  assert.match(yml, /--tanda "\$\{\{ matrix\.tanda \}\}\/\$\{\{ strategy\.job-total \}\}"/);
});
