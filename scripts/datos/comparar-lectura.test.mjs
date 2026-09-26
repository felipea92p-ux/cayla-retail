// Pruebas de la lectura de código de `comparar.mjs`. Sin dependencias: `node --test scripts/datos/comparar-lectura.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { fechaDeLaFoto, nombresEntreComillas, sinComentarios } from "./comparar-lectura.mjs";

const CONOCIDAS = new Set(["desactivar_proveedor", "reactivar_proveedor", "cerrar_periodo", "registrar_activo", "agregar_colaborador", "registrar_venta"]);
const nombres = (texto) => nombresEntreComillas(texto, CONOCIDAS).map((x) => x.nombre);

// ---- sinComentarios ------------------------------------------------------------------------------------------------

test("los comentarios de línea y de bloque quedan en blanco, sin mover ninguna posición ni línea", () => {
  const texto = 'a(1); // uno\n/* dos\n   tres */ b(2);\n';
  const limpio = sinComentarios(texto);
  assert.equal(limpio.length, texto.length);
  assert.equal(limpio.split("\n").length, texto.split("\n").length);
  assert.ok(!limpio.includes("uno") && !limpio.includes("dos") && !limpio.includes("tres"));
  assert.ok(limpio.includes("a(1);") && limpio.includes("b(2);"));
});

test("una «//» dentro de un texto entre comillas NO es un comentario (una URL no se come lo que sigue)", () => {
  const limpio = sinComentarios('const u = "https://cayla.pe/x"; const v = 2; // sí es comentario');
  assert.ok(limpio.includes('"https://cayla.pe/x"') && limpio.includes("const v = 2;"));
  assert.ok(!limpio.includes("sí es comentario"));
});

test("un apóstrofo suelto en un texto de pantalla no se «traga» lo que sigue en las demás líneas", () => {
  // Las comillas simples no cruzan un salto de línea: el daño se acota a esa línea.
  const limpio = sinComentarios("<p>d'Artagnan</p>\nrpc('cerrar_periodo'); // comentario\n");
  assert.ok(limpio.includes("rpc('cerrar_periodo');"));
  assert.ok(!limpio.includes("comentario"));
});

test("una plantilla puede cruzar líneas y sus «//» tampoco son comentarios", () => {
  const limpio = sinComentarios("const t = `linea 1 // no\nlinea 2`; // sí\n");
  assert.ok(limpio.includes("linea 1 // no") && limpio.includes("linea 2"));
  assert.ok(!limpio.includes("sí"));
});

// ---- nombresEntreComillas ------------------------------------------------------------------------------------------

test("un ternario dentro del .rpc(): las DOS funciones cuentan (era el caso de Proveedores y Categorías)", () => {
  const texto = 'const { error } = await supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_id: p.id });';
  assert.deepEqual(nombres(texto), ["desactivar_proveedor", "reactivar_proveedor"]);
});

test("un ayudante que recibe el nombre (Cierre de mes): cuenta, con comillas simples, dobles o de plantilla", () => {
  assert.deepEqual(nombres('llamar("cerrar_periodo", { p_mes: mes })'), ["cerrar_periodo"]);
  assert.deepEqual(nombres("llamar('cerrar_periodo', {})"), ["cerrar_periodo"]);
  assert.deepEqual(nombres("llamar(`cerrar_periodo`, {})"), ["cerrar_periodo"]);
});

test("lo escrito en un comentario NO cuenta, ni con acentos graves (10 de las 29 de la lista solo aparecían en comentarios)", () => {
  assert.deepEqual(nombres("// `agregar_colaborador` ya lo valida antes"), []);
  assert.deepEqual(nombres('/* "registrar_activo" */'), []);
  assert.deepEqual(nombres("/**\n * La base revalida (`registrar_activo`).\n */\nconst x = 1;"), []);
  // Y un nombre real en el código, aunque haya un comentario que lo cita en la misma línea, sí cuenta:
  assert.deepEqual(nombres('rpc("registrar_activo"); // `registrar_activo`'), ["registrar_activo"]);
});

test("solo cuenta el nombre completo: ni un nombre más largo ni una frase que lo contiene", () => {
  assert.deepEqual(nombres('x("registrar_activo_x")'), []);
  assert.deepEqual(nombres('x("la función registrar_activo")'), []);
  assert.deepEqual(nombres('x("no_registrar_activo")'), []);
});

test("un nombre que no es de producción no se reporta", () => {
  assert.deepEqual(nombres('x("otra_funcion")'), []);
});

test("cada nombre sale una vez, con la línea de su primera aparición", () => {
  const texto = 'a();\nrpc("cerrar_periodo");\nb();\nrpc("cerrar_periodo");\nrpc("registrar_venta");';
  assert.deepEqual(nombresEntreComillas(texto, CONOCIDAS), [
    { nombre: "cerrar_periodo", linea: 2 },
    { nombre: "registrar_venta", linea: 5 },
  ]);
});

test("la línea es la del original aunque haya comentarios de bloque antes", () => {
  const texto = '/* a\n b\n c */\nrpc("cerrar_periodo");';
  assert.deepEqual(nombresEntreComillas(texto, CONOCIDAS), [{ nombre: "cerrar_periodo", linea: 4 }]);
});

test("una URL con «//» antes del nombre en la misma línea no lo esconde", () => {
  assert.deepEqual(nombres('const u = "https://x.pe"; rpc("cerrar_periodo");'), ["cerrar_periodo"]);
});

// ---- fechaDeLaFoto -------------------------------------------------------------------------------------------------

test("la fecha de la foto sale en palabras y en UTC, sin segundos", () => {
  assert.equal(fechaDeLaFoto("2026-09-25T16:09:32.608839+00:00"), "2026-09-25 16:09 UTC");
  // Una hora con otro huso se lleva a UTC (16:09 UTC es 11:09 en Lima).
  assert.equal(fechaDeLaFoto("2026-09-25T11:09:32-05:00"), "2026-09-25 16:09 UTC");
});

test("sin fecha o con una fecha que no se entiende, null (el informe dice «sin fecha», no inventa una)", () => {
  assert.equal(fechaDeLaFoto(undefined), null);
  assert.equal(fechaDeLaFoto(null), null);
  assert.equal(fechaDeLaFoto("ayer"), null);
  assert.equal(fechaDeLaFoto(""), null);
});

// ---- El oráculo: el parser de TypeScript -----------------------------------------------------------------------------

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let ts = null;
try {
  ts = createRequire(join(RAIZ, "package.json"))("typescript");
} catch {
  // Sin node_modules (el paso de CI corre aunque falle la instalación): el oráculo se omite, las demás pruebas no.
}

function archivosDeWeb(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const r = join(dir, e);
    if (statSync(r).isDirectory()) archivosDeWeb(r, acc);
    else if (/\.(ts|tsx|mts)$/.test(e) && !/\.test\./.test(e)) acc.push(r);
  }
  return acc;
}

// Las pruebas de arriba son casos que se me ocurrieron a mí. Esta compara el escáner contra quien sí sabe qué es un
// comentario y qué es un texto en TypeScript —su parser— en CADA archivo real de `apps/web`. Si el repo cambia y aparece
// un caso que el escáner lee mal (un literal de expresión regular con una comilla, por ejemplo), falla aquí y dice cuál,
// en vez de dejar que `DRIFT.md` diga «sobra» de una función en uso, o «se usa» de una que solo está en un comentario.
test("el escáner coincide con el parser de TypeScript en todos los archivos de apps/web", { skip: ts ? false : "typescript no está instalado" }, () => {
  const conocidas = new Set(
    readFileSync(join(RAIZ, "docs", "datos", "generado", "funciones-produccion.txt"), "utf8")
      .split("\n")
      .map((l) => (l.match(/^([a-z0-9_]+)\(/i) || [])[1])
      .filter(Boolean),
  );
  assert.ok(conocidas.size > 100, "la foto de funciones de producción no se pudo leer");

  const porParser = (ruta, texto) => {
    const sf = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const vistos = new Set();
    const visita = (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && conocidas.has(n.text)) vistos.add(n.text);
      ts.forEachChild(n, visita);
    };
    visita(sf);
    return vistos;
  };

  const archivos = archivosDeWeb(join(RAIZ, "apps", "web"));
  assert.ok(archivos.length > 100, "no se encontraron los archivos de apps/web");
  const diferencias = [];
  for (const ruta of archivos) {
    const texto = readFileSync(ruta, "utf8");
    const mio = new Set(nombresEntreComillas(texto, conocidas).map((x) => x.nombre));
    const parser = porParser(ruta, texto);
    for (const n of mio) if (!parser.has(n)) diferencias.push(`«${n}» en ${relative(RAIZ, ruta)}: el escáner lo ve entre comillas y el parser NO (¿un comentario o un texto suelto? taparía una función que sobra)`);
    for (const n of parser) if (!mio.has(n)) diferencias.push(`«${n}» en ${relative(RAIZ, ruta)}: el parser lo ve y el escáner NO (dejaría una función en uso como «sin llamada»)`);
  }
  assert.deepEqual(diferencias, [], `El escáner de comparar-lectura.mjs discrepa del parser de TypeScript:\n  ${diferencias.slice(0, 10).join("\n  ")}`);
});
