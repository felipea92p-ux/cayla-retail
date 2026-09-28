// Pruebas del comparador de deriva. Sin dependencias: `node --test scripts/migraciones/deriva.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONOCIDAS, compararHuellas, informe, leerHuellas, resumen } from "./deriva.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

test("el resumen para lo público da solo cuentas, nunca un nombre", () => {
  const r = compararHuellas(
    leerHuellas(celda(["fn", "emitir_comprobante(x int)", "1"], ["politica", "clientas.secreta", "2"])),
    leerHuellas(celda(["fn", "emitir_comprobante(x int)", "9"], ["fn", "fn_en_vivo()", "3"])),
    [],
  );
  const texto = resumen(r);
  assert.equal(texto, "✗ 3 diferencias entre producción y main: 1 de main sin pegar en producción, 1 solo en producción, 1 con otra versión.");
  for (const nombre of ["emitir_comprobante", "clientas", "fn_en_vivo"]) assert.ok(!texto.includes(nombre), nombre);
  assert.match(resumen(compararHuellas(new Map(), new Map())), /^✓ /);
});

test("la función de producción es la consulta de deriva.sql al pie de la letra, con el mismo search_path", () => {
  const deriva = readFileSync(join(RAIZ, "scripts", "migraciones", "deriva.sql"), "utf8");
  const migracion = readFileSync(join(RAIZ, "supabase", "migrations", "20260928210000_huellas_catalogo_con_llave.sql"), "utf8");
  const sinEspacios = (t) => t.replace(/\s+/g, " ").trim();
  const consulta = deriva.slice(deriva.indexOf("select string_agg(")).replace(/;\s*$/, "").replace(" as huellas\n", " into v_huellas\n");
  assert.ok(sinEspacios(migracion).includes(sinEspacios(consulta)), "el cuerpo de huellas_catalogo no es la consulta de deriva.sql");
  const ruta = deriva.match(/^set search_path = ([^;]+);$/m)?.[1];
  assert.ok(ruta, "deriva.sql fija su search_path");
  const funcion = migracion.slice(migracion.indexOf("create or replace function retail.huellas_catalogo"));
  assert.match(funcion, new RegExp(`set search_path = ${ruta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n`));
});
