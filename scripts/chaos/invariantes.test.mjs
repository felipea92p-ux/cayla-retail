// Pruebas de `scripts/chaos/invariantes.mjs` — la parte que NO necesita Docker: la forma de la batería, las huellas, la comparación
// «antes/después de un ataque» y la lógica de la autoprueba (con un `ejecutar` falso). Que las consultas SQL den bien contra la base
// real lo comprueba `pnpm chaos:invariantes` (y `--autoprueba`), que sí habla con el contenedor local.
// `node --test scripts/chaos/`
import assert from "node:assert/strict";
import { test } from "node:test";
import { autoprobar, evaluar, fotoDe, huellaDe, INVARIANTES, nuevasContra } from "./invariantes.mjs";

test("la batería tiene forma: ids únicos, gravedad 1 o 2, SQL de solo lectura y una corrupción (o el motivo de no tenerla)", () => {
  const ids = INVARIANTES.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  assert.equal(new Set(INVARIANTES.map((i) => i.nombre)).size, ids.length, "nombres repetidos");
  for (const i of INVARIANTES) {
    assert.match(i.id, /^INV-\d{2}$/);
    assert.ok([1, 2].includes(i.gravedad), `${i.id}: gravedad ${i.gravedad}`);
    assert.ok(["cruzada", "sospecha"].includes(i.nivel), `${i.id}: nivel ${i.nivel}`);
    assert.ok(i.dice.length > 40, `${i.id}: dice qué vigila, en palabras del negocio`);
    assert.match(i.sql.trim(), /^(with|select)\b/i, `${i.id}: la consulta es un select`);
    assert.doesNotMatch(i.sql, /\b(insert|update|delete|truncate|drop|alter)\b/i, `${i.id}: la consulta NO escribe`);
    assert.ok(i.corrompe || i.sinAutoprueba, `${i.id}: declara cómo se corrompe o por qué no se puede`);
    if (i.sinAutoprueba) assert.ok(i.sinAutoprueba.length >= 30, `${i.id}: el motivo de no probarse se explica`);
  }
});

test("una sospecha lo dice en su texto: no se la puede confundir con un estado imposible", () => {
  for (const i of INVARIANTES.filter((x) => x.nivel === "sospecha")) assert.match(i.dice, /^SOSPECHA/, i.id);
  for (const i of INVARIANTES.filter((x) => x.nivel === "cruzada")) assert.doesNotMatch(i.dice, /^SOSPECHA/, i.id);
});

test("las invariantes que la base ya impide con un check o un índice único no están: solo las que cruzan tablas", () => {
  // `stock_cantidad_check`, `cajas_ubicacion_abierta_unica`, `comprobantes_tipo_serie_numero_key`, `ventas_token_cliente_key`…
  const texto = INVARIANTES.map((i) => i.sql).join("\n");
  assert.doesNotMatch(texto, /cantidad\s*<\s*0/, "stock negativo: lo impide `stock_cantidad_check`");
  assert.doesNotMatch(texto, /count\(\*\)\s*>\s*1[\s\S]{0,80}estado\s*=\s*'abierta'/, "dos cajas abiertas: lo impide un índice único");
});

test("huellaDe: la misma fila da la misma huella; otra fila, otra", () => {
  assert.equal(huellaDe({ a: 1, b: "x" }), huellaDe({ a: 1, b: "x" }));
  assert.notEqual(huellaDe({ a: 1 }), huellaDe({ a: 2 }));
  assert.equal(huellaDe({ a: 1 }).length, 12);
});

const res = (id, filas, estado) => ({ id, nombre: id, gravedad: 1, nivel: "cruzada", filas, estado: estado ?? (filas.length ? "viola" : "limpia") });

test("fotoDe + nuevasContra: solo cuenta lo que el ataque rompió, no la historia que ya traía la base", () => {
  const vieja = { venta_id: "A" };
  const foto = fotoDe([res("INV-02", [vieja]), res("INV-03", [])]);
  const nueva = { venta_id: "B" };
  const ahora = nuevasContra(foto, [res("INV-02", [vieja, nueva]), res("INV-03", [])]);
  assert.equal(ahora[0].estado, "viola");
  assert.deepEqual(ahora[0].filas, [nueva]);
  assert.equal(ahora[1].estado, "limpia");
});

test("nuevasContra: lo que ya estaba roto y sigue igual NO es culpa del ataque", () => {
  const vieja = { movimiento_id: "M1" };
  const foto = fotoDe([res("INV-10", [vieja])]);
  const ahora = nuevasContra(foto, [res("INV-10", [vieja])]);
  assert.equal(ahora[0].estado, "limpia");
  assert.deepEqual(ahora[0].filas, []);
});

test("una invariante que no estaba en la foto cuenta entera como nueva (no se pierde por haberse agregado después)", () => {
  const ahora = nuevasContra({}, [res("INV-99", [{ x: 1 }])]);
  assert.equal(ahora[0].estado, "viola");
});

test("una invariante con error NO se confunde con limpia, ni en la foto ni al comparar", () => {
  const foto = fotoDe([res("INV-09", [], "error")]);
  assert.equal("INV-09" in foto, false, "no se anota como «limpia» en la foto");
  const ahora = nuevasContra(foto, [res("INV-09", [], "error")]);
  assert.equal(ahora[0].estado, "error");
});

const inv = { id: "INV-XX", nombre: "x", gravedad: 1, nivel: "cruzada", sql: "select 1 as a where false", corrompe: "update t set a = 1;" };

test("evaluar: sin filas es limpia, con filas viola y un fallo de psql es error (nunca limpia)", () => {
  assert.equal(evaluar(inv, () => "").estado, "limpia");
  const viola = evaluar(inv, () => '{"a":1}\n{"a":2}');
  assert.equal(viola.estado, "viola");
  assert.equal(viola.filas.length, 2);
  const error = evaluar(inv, () => { throw Object.assign(new Error("boom"), { stderr: "psql: ERROR:  relation does not exist" }); });
  assert.equal(error.estado, "error");
  assert.match(error.mensaje, /ERROR/);
});

test("evaluar corre en `read only`: aunque el SQL de una invariante escribiera por error, Postgres lo rechaza", () => {
  let enviado = "";
  evaluar(inv, (sql) => { enviado = sql; return ""; });
  assert.match(enviado, /^begin read only;/);
  assert.match(enviado, /rollback;\s*$/);
});

test("autoprobar: detecta si tras corromper aparece una fila nueva; es CIEGA si no", () => {
  let llamada = 0;
  const detecta = autoprobar(inv, () => (++llamada === 1 ? "" : '{"a":1}'));
  assert.equal(detecta.estado, "detecta");
  llamada = 0;
  const ciega = autoprobar(inv, () => "");
  assert.equal(ciega.estado, "ciega");
});

test("autoprobar: una violación que YA existía antes de corromper no cuenta como detección", () => {
  const ya = '{"a":1}';
  assert.equal(autoprobar(inv, () => ya).estado, "ciega");
});

test("autoprobar: corrompe y consulta en la MISMA transacción, y esa transacción siempre se revierte", () => {
  let tx = "";
  let n = 0;
  autoprobar(inv, (sql) => { if (++n === 2) tx = sql; return ""; });
  assert.match(tx, /^begin;/);
  assert.ok(tx.indexOf("update t set a = 1;") < tx.indexOf("row_to_json"), "primero corrompe, después mira");
  assert.match(tx, /rollback;\s*$/);
});

test("autoprobar: tabla vacía = «sin datos» (la prueba no se pudo hacer), jamás «detecta»", () => {
  let n = 0;
  const r = autoprobar(inv, () => {
    if (++n === 1) return "";
    throw Object.assign(new Error("x"), { stderr: 'ERROR:  null value in column "id" violates not-null constraint' });
  });
  assert.equal(r.estado, "sin-datos");
});

test("autoprobar: lo que no se puede corromper se dice en voz alta, no se aprueba en silencio", () => {
  const r = autoprobar({ ...inv, corrompe: undefined, sinAutoprueba: "un libro inmutable a propósito, no se toca ni revertido" }, () => { throw new Error("no debe llamar a la base"); });
  assert.equal(r.estado, "sin-autoprueba");
  assert.match(r.mensaje, /libro inmutable/);
});
