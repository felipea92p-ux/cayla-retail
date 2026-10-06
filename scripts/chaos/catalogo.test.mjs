// Pruebas de `scripts/chaos/catalogo.mjs`: que el catálogo cubra las ocho familias, que cada ataque diga qué espera, que no cite
// una invariante que no existe, y que el plan sea REPRODUCIBLE con la misma semilla (sin eso un hallazgo no se puede repetir).
// `node --test scripts/chaos/catalogo.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { ATAQUES, aplica, FAMILIAS, INGREDIENTES, plan, prng, sortearValores, VALORES_HOSTILES } from "./catalogo.mjs";
import { INVARIANTES } from "./invariantes.mjs";

const CLAVES = Object.keys(FAMILIAS);

test("las ocho familias que Felipe pidió existen, cada una con su prefijo único", () => {
  assert.deepEqual(CLAVES.sort(), ["celular", "concurrencia", "doble-clic", "entradas", "navegacion", "permisos", "red-sesion", "teclado"]);
  const prefijos = Object.values(FAMILIAS).map((f) => f.prefijo);
  assert.equal(new Set(prefijos).size, prefijos.length);
});

test("cada familia tiene al menos 6 ataques y al menos uno de núcleo (el catálogo fijo)", () => {
  for (const c of CLAVES) {
    const deEsta = ATAQUES.filter((a) => a.familia === c);
    assert.ok(deEsta.length >= 6, `${c}: solo ${deEsta.length} ataques`);
    assert.ok(deEsta.some((a) => a.nucleo), `${c}: sin ataque de núcleo`);
  }
});

test("cada ataque es completo: id con el prefijo de su familia, nombre, pasos, lo esperado, capa válida y gravedad de 1 a 4", () => {
  const ids = ATAQUES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const a of ATAQUES) {
    assert.match(a.id, new RegExp(`^${FAMILIAS[a.familia].prefijo}-\\d{2}$`), a.id);
    assert.ok(a.nombre.length >= 8, `${a.id}: nombre`);
    assert.ok(a.como.length >= 40, `${a.id}: «como» dice los pasos`);
    assert.ok(a.esperado.length >= 40, `${a.id}: «esperado» dice qué hace un sistema resistente`);
    assert.ok(["navegador", "base", "ambas"].includes(a.capa), `${a.id}: capa ${a.capa}`);
    assert.ok([1, 2, 3, 4].includes(a.gravedadTipica), `${a.id}: gravedad`);
    for (const i of a.aplica) assert.ok(INGREDIENTES.includes(i), `${a.id}: ingrediente desconocido «${i}»`);
  }
});

test("lo que escribe en la base dice qué invariantes mirar después, y solo cita invariantes que existen", () => {
  const existentes = new Set(INVARIANTES.map((i) => i.id));
  for (const a of ATAQUES) {
    for (const m of a.mira) assert.ok(existentes.has(m), `${a.id} cita ${m}, que no existe`);
    // Un ataque de gravedad 1 que escribe sin decir qué mirar sería un ataque que no sabe qué rompió.
    // Los de permisos lo cumplen con INV-01/INV-10; las excepciones son de «lectura» (no escriben).
    if (a.escribe && a.gravedadTipica === 1) assert.ok(a.mira.length > 0, `${a.id}: escribe, es de gravedad 1 y no dice qué invariantes mirar`);
  }
});

test("la capa «base» o «ambas» existe para lo que el navegador no puede ver (concurrencia, permisos, funciones)", () => {
  assert.ok(ATAQUES.filter((a) => a.capa === "base").length >= 10);
  assert.ok(ATAQUES.filter((a) => a.capa === "navegador").length >= 20);
  assert.ok(ATAQUES.filter((a) => a.capa === "ambas").length >= 5);
});

test("el celular es de Vender, Cambios y Devoluciones (PL-105): el ataque de celular pide el ingrediente «celular»", () => {
  for (const a of ATAQUES.filter((x) => x.familia === "celular")) assert.ok(a.aplica.includes("celular"), a.id);
});

test("los valores hostiles cubren lo que Felipe pidió: vacío, límites, formato peruano de montos, inyección, nulo, emojis", () => {
  for (const [tipo, lista] of Object.entries(VALORES_HOSTILES)) {
    assert.ok(lista.length >= 6, `${tipo}: pocos valores`);
    for (const v of lista) {
      assert.equal(typeof v.valor, "string", `${tipo}/${v.etiqueta}`);
      assert.ok(v.etiqueta.length >= 3, `${tipo}: etiqueta`);
    }
    assert.equal(new Set(lista.map((v) => v.etiqueta)).size, lista.length, `${tipo}: etiquetas repetidas`);
  }
  const todos = Object.values(VALORES_HOSTILES).flat().map((v) => v.valor);
  assert.ok(todos.includes("1,299.50"), "monto con miles");
  assert.ok(todos.includes("1.299,50"), "monto con coma decimal");
  assert.ok(todos.some((v) => /drop table/i.test(v)), "SQL");
  assert.ok(todos.some((v) => v.includes("\u0000")), "carácter nulo");
  assert.ok(todos.some((v) => v.length === 300), "300 caracteres");
  assert.ok(todos.some((v) => /👗/u.test(v)), "emojis");
  assert.ok(todos.includes("2147483648"), "desborde de entero de 32 bits");
});

test("prng: la misma semilla da la misma secuencia; otra semilla, otra", () => {
  const a = prng(42), b = prng(42), c = prng(43);
  const sa = [a(), a(), a(), a()], sb = [b(), b(), b(), b()], sc = [c(), c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

const ING = ["texto", "monto", "guarda", "dinero", "stock"];

test("plan: la misma semilla produce EXACTAMENTE el mismo plan (un hallazgo se puede repetir)", () => {
  const a = plan({ ingredientes: ING, semilla: 42, azar: 6 });
  const b = plan({ ingredientes: ING, semilla: 42, azar: 6 });
  assert.deepEqual(a, b);
});

test("plan: otra semilla cambia el azar pero NO el núcleo", () => {
  const a = plan({ ingredientes: ING, semilla: 1, azar: 6 });
  const b = plan({ ingredientes: ING, semilla: 2, azar: 6 });
  assert.deepEqual(a.nucleo.map((x) => x.id), b.nucleo.map((x) => x.id));
  assert.notDeepEqual(a.azar.map((x) => x.id), b.azar.map((x) => x.id));
});

test("plan: solo trae ataques que aplican a la pantalla y el azar no repite el núcleo", () => {
  const p = plan({ ingredientes: ["texto", "guarda"], semilla: 7, azar: 50 });
  for (const a of [...p.nucleo, ...p.azar]) assert.ok(aplica(a, ["texto", "guarda"]), `${a.id} no aplica`);
  const ids = [...p.nucleo, ...p.azar].map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "un ataque repetido");
  assert.ok(!p.nucleo.some((a) => a.id === "ENT-07"), "una pantalla sin montos no recibe el ataque de montos");
});

test("plan: una pantalla con dinero y stock recibe el doble clic, la recarga, la red cortada y la última prenda", () => {
  const ids = plan({ ingredientes: ING, semilla: 1, azar: 0 }).nucleo.map((a) => a.id);
  for (const quiero of ["DC-01", "DC-03", "NAV-03", "CON-01", "RS-01", "RS-03"]) assert.ok(ids.includes(quiero), `falta ${quiero}`);
});

test("plan: sortea valores solo de los tipos de campo que la pantalla tiene, y son estables", () => {
  const p = plan({ ingredientes: ["texto", "monto", "guarda"], semilla: 9 });
  assert.deepEqual(Object.keys(p.valores).sort(), ["monto", "texto"]);
  assert.deepEqual(p.valores, plan({ ingredientes: ["texto", "monto", "guarda"], semilla: 9 }).valores);
  const dist = sortearValores("monto", prng(3), 4);
  assert.equal(new Set(dist.map((v) => v.etiqueta)).size, 4, "sin repetir");
});

test("plan: rechaza ingredientes o familias que no existen en vez de ignorarlos en silencio", () => {
  assert.throws(() => plan({ ingredientes: ["monto", "inventado"] }), /desconocidos/);
  assert.throws(() => plan({ ingredientes: [], familias: ["nope"] }), /desconocidas/);
});

test("plan: se puede acotar a una familia", () => {
  const p = plan({ ingredientes: ING, semilla: 1, azar: 50, familias: ["doble-clic"] });
  assert.ok([...p.nucleo, ...p.azar].every((a) => a.familia === "doble-clic"));
});
