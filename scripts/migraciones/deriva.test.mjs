// Pruebas del comparador de deriva. Sin dependencias: `node --test scripts/migraciones/deriva.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONOCIDAS, compararHuellas, informe, leerHuellas } from "./deriva.mjs";

const celda = (...lineas) => lineas.map((l) => l.join("\t")).join("\n");

test("lee la celda de psql y la respuesta JSON del MCP de Supabase (con el texto envuelto) igual", () => {
  const psql = celda(["fn", "f(a int)", "aaaaaaaaaaaa"], ["politica", "t.p", "bbbbbbbbbbbb"]);
  const envuelta = JSON.stringify({
    result: `Below is the result…\n<untrusted-data-x>\n${JSON.stringify([{ huellas: psql }])}\n</untrusted-data-x>\nUse this data…`,
  });
  assert.deepEqual([...leerHuellas(psql)], [...leerHuellas(envuelta)]);
  assert.equal(leerHuellas(psql).get("fn\tf(a int)"), "aaaaaaaaaaaa");
  assert.equal(leerHuellas(JSON.stringify([{ huellas: psql }])).size, 2);
});

test("una línea incompleta se rechaza en vez de compararse a medias", () => {
  assert.throws(() => leerHuellas("fn\tf()"), /mal formada/);
});

test("separa lo que falta pegar, lo que solo vive en producción y lo que tiene otra versión", () => {
  const main = leerHuellas(celda(["fn", "igual()", "111"], ["fn", "nueva()", "222"], ["fn", "cambiada()", "333"]));
  const prod = leerHuellas(celda(["fn", "igual()", "111"], ["fn", "en_vivo()", "444"], ["fn", "cambiada()", "999"]));
  const r = compararHuellas(main, prod, []);
  assert.deepEqual(r.soloMain, [{ g: "fn", k: "nueva()" }]);
  assert.deepEqual(r.soloProduccion, [{ g: "fn", k: "en_vivo()" }]);
  assert.deepEqual(r.distintas, [{ g: "fn", k: "cambiada()" }]);
});

test("lo conocido se aparta con su motivo y no cuenta como diferencia", () => {
  const main = leerHuellas(celda(["candado", "gastos.gastos_igv_check", "1"]));
  const prod = leerHuellas(celda(["candado", "gastos.gastos_igv_check1", "1"], ["indice", "gastos_legado_2026_09_pkey", "2"], ["vista", "planilla_por_sede", "3"]));
  const r = compararHuellas(main, prod);
  assert.equal(r.soloMain.length + r.soloProduccion.length + r.distintas.length, 0);
  assert.equal(r.conocidas.length, 4);
});

test("una conocida no tapa lo que se le parece: otro candado de gastos o una función nueva con «legado» en el nombre", () => {
  const prod = leerHuellas(celda(["candado", "gastos.gastos_total_check", "1"], ["fn", "registrar_gasto_legado_2027_01(x int)", "2"], ["columna", "gastos_legado_2026_10.id", "3"]));
  const r = compararHuellas(new Map(), prod);
  assert.equal(r.soloProduccion.length, 3);
  assert.equal(r.conocidas.length, 0);
});

test("cada conocida tiene su porqué escrito", () => {
  for (const c of CONOCIDAS) assert.ok(c.motivo.length > 40, `${c.patron} sin motivo`);
});

test("el informe dice cada cosa en palabras del negocio, y dice verde cuando no hay nada", () => {
  const r = compararHuellas(leerHuellas(celda(["politica", "clientas.x", "1"])), leerHuellas(celda(["fn", "fn_rentabilidad(p date)", "2"])), []);
  const texto = informe(r);
  assert.match(texto, /SQL sin pegar \(1\)/);
  assert.match(texto, /arreglo en vivo que main perdería \(1\)/);
  assert.match(texto, /política clientas\.x/);
  assert.match(informe(r, { markdown: true }), /^- función `fn_rentabilidad\(p date\)`$/m);
  assert.match(informe(compararHuellas(new Map(), new Map())), /^✓ /);
});
