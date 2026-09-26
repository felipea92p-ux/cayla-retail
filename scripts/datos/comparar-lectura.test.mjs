// Pruebas de la lectura de código de `comparar.mjs`. Sin más dependencia que `typescript` (ya está en la raíz):
// `node --test scripts/datos/comparar-lectura.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esDePrueba, fechaDeLaFoto, nombresEntreComillas, sinComentarios } from "./comparar-lectura.mjs";

const CONOCIDAS = new Set(["desactivar_proveedor", "reactivar_proveedor", "cerrar_periodo", "registrar_activo", "agregar_colaborador", "registrar_venta", "fn_balance_general"]);
const nombres = (texto) => nombresEntreComillas(texto, CONOCIDAS).map((x) => x.nombre);

// ---- sinComentarios ------------------------------------------------------------------------------------------------

test("los comentarios de línea y de bloque quedan en blanco, sin mover ninguna posición ni línea", () => {
  const texto = "a(1); // uno\n/* dos\n   tres */ b(2);\n";
  const limpio = sinComentarios(texto);
  assert.equal(limpio.length, texto.length);
  assert.equal(limpio.split("\n").length, texto.split("\n").length);
  assert.ok(!limpio.includes("uno") && !limpio.includes("dos") && !limpio.includes("tres"));
  assert.ok(limpio.includes("a(1);") && limpio.includes("b(2);"));
});

test("un comentario JSDoc (`/** … */`) también se quita", () => {
  const limpio = sinComentarios('/**\n * Ejemplo: `supabase.rpc("abrir_caja", {...})`\n */\nexport const x = 1;\n');
  assert.ok(!limpio.includes("abrir_caja") && limpio.includes("export const x = 1;"));
});

test("una «//» dentro de un texto entre comillas NO es un comentario (una URL no se come lo que sigue)", () => {
  const limpio = sinComentarios('const u = "https://cayla.pe/x"; const v = 2; // sí es comentario');
  assert.ok(limpio.includes('"https://cayla.pe/x"') && limpio.includes("const v = 2;"));
  assert.ok(!limpio.includes("sí es comentario"));
});

test("una plantilla puede cruzar líneas y sus «//» tampoco son comentarios", () => {
  const limpio = sinComentarios("const t = `linea 1 // no\nlinea 2`; // sí\n");
  assert.ok(limpio.includes("linea 1 // no") && limpio.includes("linea 2"));
  assert.ok(!limpio.includes("sí"));
});

// Los casos que ROMPÍAN la primera versión (un recorrido a mano): salen de código real de apps/web.

test("una expresión regular con «//» (foto-perfil.ts) NO abre un comentario: lo de después en la línea se conserva", () => {
  const limpio = sinComentarios('const re = /^https?:\\/\\//i; rpc("cerrar_periodo"); // nota\n');
  assert.ok(limpio.includes('rpc("cerrar_periodo")'), "el `rpc` de la misma línea se perdió");
  assert.ok(!limpio.includes("nota"));
});

test("el idioma CSV (`/[;\"\\n]/` + plantilla) no desincroniza: un comentario de varias líneas después SÍ se quita", () => {
  const texto = [
    "export function celda(s) {",
    '  return /[;"\\n]/.test(s) ? `"${s.replace(/"/g, \'""\')}"` : s;',
    "}",
    "",
    "// Sale de `fn_balance_general` (esto es un comentario, no una llamada).",
    "export const otra = 1;",
    "",
  ].join("\n");
  const limpio = sinComentarios(texto);
  assert.ok(!limpio.includes("fn_balance_general"), "el comentario de después del idioma CSV quedó sin quitar");
  assert.ok(limpio.includes("export const otra = 1;"));
});

test("una «/*» dentro de una expresión regular no abre un comentario de bloque que se trague el resto del archivo", () => {
  const limpio = sinComentarios('const r = /\\/*x/; rpc("cerrar_periodo");\nconst z = 2; // fin\n');
  assert.ok(limpio.includes('rpc("cerrar_periodo")') && limpio.includes("const z = 2;"));
});

test("el texto de un JSX no es un comentario, aunque empiece con «//»", () => {
  const limpio = sinComentarios("export const A = () => <p>// esto se ve en pantalla</p>;\n", "A.tsx");
  assert.ok(limpio.includes("// esto se ve en pantalla"));
});

test("ni «/* … */» en el texto de un JSX es un comentario", () => {
  const limpio = sinComentarios("export const A = () => <p>/* se ve en pantalla */</p>; // sí es comentario\n", "A.tsx");
  assert.ok(limpio.includes("/* se ve en pantalla */"));
  assert.ok(!limpio.includes("sí es comentario"));
});

test("un apóstrofo suelto en el texto de un JSX no se «traga» los comentarios ni el código que sigue", () => {
  const limpio = sinComentarios("export const A = () => <p>d'Artagnan</p>; // c\nconst x = rpc('cerrar_periodo'); // d\n", "A.tsx");
  assert.ok(limpio.includes("rpc('cerrar_periodo')"));
  assert.ok(!limpio.includes("// c") && !limpio.includes("// d"));
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

test("lo escrito en un comentario NO cuenta, ni con acentos graves (7 de las 29 de la lista solo aparecían en comentarios)", () => {
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

// Los casos donde la primera versión veía lo que no era (falsos positivos) — también de código real.

test("un nombre entre comillas dentro del TEXTO de un JSX no es un texto del código", () => {
  assert.deepEqual(nombresEntreComillas('export const A = () => <p>"cerrar_periodo"</p>;', CONOCIDAS, "A.tsx"), []);
});

test("un nombre dentro de una plantilla con más texto (`select 'x'`) no es el nombre solo", () => {
  assert.deepEqual(nombres("const q = sql`select 'cerrar_periodo'`;"), []);
});

test("un comentario dentro de un `${ }` no cuenta, y el nombre real sí", () => {
  assert.deepEqual(nombres('const t = `a ${ /* "cerrar_periodo" */ x }`;'), []);
  assert.deepEqual(nombres("const t = `a ${ f('cerrar_periodo') }`;"), ["cerrar_periodo"]);
});

test("el atributo de texto de un JSX sí es un texto del código", () => {
  assert.deepEqual(nombresEntreComillas('export const A = () => <X fn="cerrar_periodo" />;', CONOCIDAS, "A.tsx"), [{ nombre: "cerrar_periodo", linea: 1 }]);
});

// ---- esDePrueba ----------------------------------------------------------------------------------------------------

test("las pruebas no son pantallas, con cualquiera de las tres extensiones", () => {
  assert.equal(esDePrueba("apps/web/lib/x.test.ts"), true);
  assert.equal(esDePrueba("apps/web/components/X.test.tsx"), true);
  assert.equal(esDePrueba("apps/web/lib/x.test.mts"), true);
  assert.equal(esDePrueba("apps/web/lib/x.ts"), false);
  assert.equal(esDePrueba("apps/web/lib/contest.tsx"), false);
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

// ---- Con el código real ---------------------------------------------------------------------------------------------

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function archivosDeWeb(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const r = join(dir, e);
    if (statSync(r).isDirectory()) archivosDeWeb(r, acc);
    else if (/\.(ts|tsx|mts)$/.test(e)) acc.push(r);
  }
  return acc;
}

// Lo que el resto del script da por hecho: que las posiciones no se muevan (el número de línea de cada llamada se saca
// del texto original) y que leer cualquier archivo real no falle. Recorre TODOS los de apps/web.
test("en cada archivo real de apps/web, quitar comentarios conserva la longitud y las líneas", () => {
  const archivos = archivosDeWeb(join(RAIZ, "apps", "web"));
  assert.ok(archivos.length > 100, "no se encontraron los archivos de apps/web");
  const mal = [];
  for (const ruta of archivos) {
    const texto = readFileSync(ruta, "utf8");
    const limpio = sinComentarios(texto, ruta);
    if (limpio.length !== texto.length || limpio.split("\n").length !== texto.split("\n").length) mal.push(ruta.replace(RAIZ + "/", ""));
  }
  assert.deepEqual(mal, [], `Estos archivos cambian de largo o de líneas al quitar los comentarios:\n  ${mal.slice(0, 10).join("\n  ")}`);
});
