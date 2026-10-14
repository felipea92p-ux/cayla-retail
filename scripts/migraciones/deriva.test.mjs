// Pruebas del comparador de deriva. Sin dependencias: `node --test scripts/migraciones/deriva.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONOCIDAS, compararHuellas, informe, leerHuellas, resumen } from "./deriva.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(RAIZ, "scripts", "migraciones", "deriva.mjs");

/** Corre el script como lo corre `deriva-diaria.yml`: el código de salida es lo que decide el aviso. */
function correr(main, produccion, ...opciones) {
  const dir = mkdtempSync(join(tmpdir(), "deriva-"));
  const rutas = [main, produccion].map((contenido, i) => {
    if (contenido === null) return join(dir, `no-existe-${i}.tsv`);
    writeFileSync(join(dir, `${i}.tsv`), contenido);
    return join(dir, `${i}.tsv`);
  });
  const r = spawnSync(process.execPath, [SCRIPT, ...rutas, ...opciones], { encoding: "utf8" });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

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
  assert.equal(r.conocidas.length, 2);
});

test("los candados de gastos con sufijo 1 en producción SE COMPARAN con los de main: un cambio sin pegar se ve", () => {
  const main = leerHuellas(celda(["candado", "gastos.gastos_igv_check", "781f84d2b138"], ["candado", "gastos.gastos_ubicacion_id_fkey", "d6f226a73d55"]));
  const iguales = leerHuellas(celda(["candado", "gastos.gastos_igv_check1", "781f84d2b138"], ["candado", "gastos.gastos_ubicacion_id_fkey1", "d6f226a73d55"]));
  const r = compararHuellas(main, iguales);
  assert.equal(r.soloMain.length + r.soloProduccion.length + r.distintas.length + r.conocidas.length, 0);
  // El check de IGV cambió en main y no se pegó: sale como «otra versión», con el nombre de main.
  const otroIgv = leerHuellas(celda(["candado", "gastos.gastos_igv_check1", "ffffffffffff"], ["candado", "gastos.gastos_ubicacion_id_fkey1", "d6f226a73d55"]));
  assert.deepEqual(compararHuellas(main, otroIgv).distintas, [{ g: "candado", k: "gastos.gastos_igv_check" }]);
  // Y si producción algún día los renombra, se comparan por su nombre sin tocar nada.
  assert.equal(compararHuellas(main, main).distintas.length, 0);
});

test("una conocida no tapa lo que se le parece: otro candado de gastos o una función nueva con «legado» en el nombre", () => {
  const prod = leerHuellas(celda(["candado", "gastos.gastos_total_check", "1"], ["fn", "registrar_gasto_legado_2027_01(x int)", "2"], ["columna", "gastos_legado_2026_10.id", "3"]));
  const r = compararHuellas(new Map(), prod);
  assert.equal(r.soloProduccion.length, 3);
  assert.equal(r.conocidas.length, 0);
});

test("un respaldo «respaldo_…» de un arreglo hecho en producción se aparta, pero un permiso a anon/authenticated/PUBLIC, una política o un disparador sobre él SÍ se ven (ADR-0402)", () => {
  const quieto = leerHuellas(
    celda(
      ["columna", "respaldo_b002_renumeradas_20261002.comprobante_id", "1"],
      ["candado", "respaldo_b002_renumeradas_20261002.respaldo_b002_renumeradas_20261002_pkey", "2"],
      ["indice", "respaldo_b002_renumeradas_20261002_pkey", "3"],
      ["rls", "respaldo_b002_renumeradas_20261002", "4"],
      ["permiso", "respaldo_b002_renumeradas_20261002.service_role", "5"],
    ),
  );
  const r = compararHuellas(new Map(), quieto);
  assert.equal(r.soloProduccion.length, 0);
  assert.equal(r.conocidas.length, 5);
  const expuesto = leerHuellas(
    celda(
      ["permiso", "respaldo_b002_renumeradas_20261002.authenticated", "6"],
      ["permiso", "respaldo_b002_renumeradas_20261002.anon", "7"],
      ["permiso", "respaldo_b002_renumeradas_20261002.PUBLIC", "8"],
      ["permiso_columna", "respaldo_b002_renumeradas_20261002.comprobante_id.authenticated", "9"],
      ["politica", "respaldo_b002_renumeradas_20261002.todos", "a"],
      ["disparador", "respaldo_b002_renumeradas_20261002.t", "b"],
      ["vista", "respaldo_b002_renumeradas_20261002", "c"],
      ["fn", "respaldo_b002_renumeradas_20261002()", "d"],
      ["columna", "ventas_respaldo_x.id", "e"],
    ),
  );
  assert.equal(compararHuellas(new Map(), expuesto).soloProduccion.length, 9);
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

test("el resumen para lo público no da nombres ni cuentas: dos derivas distintas se publican igual", () => {
  const r = compararHuellas(
    leerHuellas(celda(["fn", "emitir_comprobante(x int)", "1"], ["politica", "clientas.secreta", "2"])),
    leerHuellas(celda(["fn", "emitir_comprobante(x int)", "9"], ["fn", "fn_en_vivo()", "3"])),
    [],
  );
  const texto = resumen(r);
  for (const nombre of ["emitir_comprobante", "clientas", "fn_en_vivo"]) assert.ok(!texto.includes(nombre), nombre);
  assert.doesNotMatch(texto, /\d/, "una cuenta, cruzada con los PR fusionados ese día, dice qué migración falta pegar");
  // Cinco funciones de main sin pegar (lo de un PR) se publican con el mismo texto que una sola política en vivo.
  const cinco = compararHuellas(leerHuellas(celda(...[1, 2, 3, 4, 5].map((i) => ["fn", `fn_${i}()`, "1"]))), leerHuellas(celda(["fn", "otra()", "1"])), []);
  assert.equal(resumen(cinco), texto);
  assert.match(texto, /^✗ /);
  assert.match(resumen(compararHuellas(new Map(), new Map())), /^✓ /);
  // Con lo pegado (ADR-0402) la frase dice contra qué se comparó, y tampoco da nombres ni cuentas.
  const conPegados = resumen(r, { conPegados: true });
  assert.match(conPegados, /^✗ Producción no corre main más lo que los PR abiertos declaran pegado/);
  assert.equal(resumen(cinco, { conPegados: true }), conPegados);
  assert.doesNotMatch(conPegados, /\d|emitir_comprobante|fn_en_vivo/);
  assert.match(resumen(compararHuellas(new Map(), new Map()), { conPegados: true }), /^✓ Producción corre main más lo que/);
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

test("el script sale con 1 ante UNA sola diferencia y con 0 si son iguales (el aviso diario depende de ese código)", () => {
  const main = celda(["fn", "f()", "aaaaaaaaaaaa"], ["fn", "g()", "bbbbbbbbbbbb"]);
  const iguales = correr(main, main, "--resumen");
  assert.equal(iguales.codigo, 0, iguales.error);
  assert.match(iguales.salida, /^✓ /);
  const una = correr(main, celda(["fn", "f()", "aaaaaaaaaaaa"], ["fn", "g()", "cccccccccccc"]), "--resumen");
  assert.equal(una.codigo, 1, una.error);
  assert.match(una.salida, /^✗ /);
});

test("si no puede leer una celda sale con 2 (no con el 1 de «hay diferencias») y en público no la repite", () => {
  const main = celda(["fn", "f()", "aaaaaaaaaaaa"]);
  // Lo que escribe `jq -r .` si producción responde null, una página de error, un archivo que no está y una celda vacía.
  for (const [nombre, produccion] of [["null", "null\n"], ["html", "<html>502 fn_secreta(x int)\n"], ["sin archivo", null], ["vacía", ""]]) {
    const r = correr(main, produccion, "--resumen");
    assert.equal(r.codigo, 2, `${nombre}: ${r.error}`);
    assert.equal(r.salida, "", `${nombre}: no publica una línea de resumen`);
    assert.ok(!r.error.includes("fn_secreta"), `${nombre}: el registro público no repite la respuesta`);
  }
  // En privado (sin --resumen) sí dice qué línea rompió.
  assert.match(correr(main, "<html>502\n").error, /mal formada: <html>502/);
});
