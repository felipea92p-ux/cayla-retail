// Pruebas de la lectura de código de `comparar.mjs`. Sin más dependencia que `typescript` (ya está en la raíz):
// `node --test scripts/datos/comparar-lectura.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esDePrueba, fechaDeLaFoto, llamadasRpc, nombresEntreComillas } from "./comparar-lectura.mjs";

const CONOCIDAS = new Set(["desactivar_proveedor", "reactivar_proveedor", "cerrar_periodo", "registrar_activo", "agregar_colaborador", "registrar_venta", "fn_balance_general"]);
const nombres = (texto) => nombresEntreComillas(texto, CONOCIDAS).map((x) => x.nombre);

// ---- llamadasRpc ---------------------------------------------------------------------------------------------------

const rpc = (texto, ruta) => llamadasRpc(texto, ruta);

test("una llamada `.rpc(\"x\", { … })`: su nombre, su línea y las claves del primer nivel", () => {
  const [ll] = rpc('\nawait supabase.rpc("abrir_caja", { p_a: 1, p_b: x, p_c })');
  assert.deepEqual(ll, { linea: 2, nombre: "abrir_caja", nombresEnElNombre: [], argumentos: "objeto", claves: ["p_a", "p_b", "p_c"] });
});

test("sin argumentos, `.rpc(\"x\")` es una llamada sin parámetros", () => {
  assert.deepEqual(rpc('supabase.rpc("x")').map((l) => [l.nombre, l.argumentos, l.claves]), [["x", "ninguno", []]]);
});

test("`.rpc(\"x\" as never, …)` (Finanzas esquiva los tipos generados) se lee igual que `.rpc(\"x\", …)`", () => {
  const [ll] = rpc('supabase.rpc("x" as never, { p_a: 1 } as never)');
  assert.equal(ll.nombre, "x");
  assert.deepEqual(ll.claves, ["p_a"]);
});

test("solo las claves del PRIMER nivel: las de un objeto anidado son campos, no parámetros", () => {
  const [ll] = rpc('supabase.rpc("x", { p_items: items.map((i) => ({ variante_id: i.id, cantidad: 1 })), p_b: { z: 1 } })');
  assert.deepEqual(ll.claves, ["p_items", "p_b"]);
});

test("un comentario entre la coma y la clave NO hace que la clave se pierda (8 avisos falsos de «no manda p_x»)", () => {
  const [ll] = rpc('supabase.rpc("abrir_caja", {\n  p_a: 1,\n  // `undefined` no viaja en el JSON\n  p_motivo: m ? 1 : undefined,\n})');
  assert.deepEqual(ll.claves, ["p_a", "p_motivo"]);
});

// El defecto que dejó el revisor: contar llaves y comillas a mano se desordena con una expresión regular dentro.
test("una expresión regular con comilla o con «//» dentro del objeto no desordena las claves", () => {
  assert.deepEqual(rpc('supabase.rpc("f", { p_a: t.replace(/\'/g, "’"), p_b: 1, p_c: 2 })')[0].claves, ["p_a", "p_b", "p_c"]);
  assert.deepEqual(rpc('supabase.rpc("f", { p_a: t.replace(/\\/\\//g, ""), p_b: 1, p_c: 2 })')[0].claves, ["p_a", "p_b", "p_c"]);
  assert.deepEqual(rpc('supabase.rpc("f", { p_a: t.replace(/"/g, ""), p_b: 1, p_c: 2 })')[0].claves, ["p_a", "p_b", "p_c"]);
  assert.deepEqual(rpc('supabase.rpc("f", { p_a: /^https?:\\/\\//i.test(t) ? 1 : 2, p_b: 1 })')[0].claves, ["p_a", "p_b"]);
});

test("un objeto con «...», con una clave calculada o que no es un objeto NO se puede leer entero", () => {
  assert.equal(rpc('supabase.rpc("f", { ...resto, p_a: 1 })')[0].argumentos, "objeto con spread");
  assert.equal(rpc('supabase.rpc("f", { [k]: 1 })')[0].argumentos, "objeto con clave calculada");
  assert.equal(rpc('supabase.rpc("f", params)')[0].argumentos, "no es un objeto");
  assert.equal(rpc('supabase.rpc("f", cond ? { p_a: 1 } : {})')[0].argumentos, "no es un objeto");
});

test("un `.rpc(…)` en un comentario o dentro de un texto NO es una llamada", () => {
  assert.deepEqual(rpc('// supabase.rpc("x", { p_a: 1 })\n/* supabase.rpc("y") */\nconst t = "supabase.rpc(\'z\')";'), []);
  assert.deepEqual(rpc("/**\n * Ejemplo: `supabase.rpc(\"abrir_caja\", {...})`\n */\nexport const x = 1;"), []);
});

test("`createClient().rpc(…)` y `x?.rpc(…)` también son llamadas", () => {
  assert.deepEqual(rpc('createClient().rpc("a", {})').map((l) => l.nombre), ["a"]);
  assert.deepEqual(rpc('cliente?.rpc("b", {})').map((l) => l.nombre), ["b"]);
});

test("un ternario en el nombre: no hay nombre único, pero trae los DOS textos que hay dentro", () => {
  const [ll] = rpc('supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_id: p.id })');
  assert.equal(ll.nombre, null);
  assert.deepEqual(ll.nombresEnElNombre, ["desactivar_proveedor", "reactivar_proveedor"]);
  assert.deepEqual(ll.claves, ["p_id"]);
});

test("un nombre en una variable o en una plantilla con partes: no se sabe cuál llama (`nombre` null, sin textos)", () => {
  assert.deepEqual(rpc("supabase.rpc(RPC_BAJADA, {})").map((l) => [l.nombre, l.nombresEnElNombre]), [[null, []]]);
  assert.deepEqual(rpc("supabase.rpc(`registrar_${x}`, {})").map((l) => [l.nombre, l.nombresEnElNombre]), [[null, []]]);
});

test("un `.rpc` que no es de supabase pero se llama igual sin argumentos no cuenta (no hay nombre que leer)", () => {
  assert.deepEqual(rpc("cliente.rpc()"), []);
});

test("un archivo `.ts` con un cast `<T>x` y genéricos se lee (no se tumba por leerlo como TSX)", () => {
  const texto = 'export function f<T>(x: unknown): T { const y = <T>x; return supabase.rpc("a", { p_x: y }) as unknown as T; }';
  assert.deepEqual(rpc(texto, "lib/f.ts").map((l) => [l.nombre, l.claves]), [["a", ["p_x"]]]);
});

test("la línea de la llamada es la de `.rpc`, aunque haya comentarios de bloque antes y la cadena cruce líneas", () => {
  const [ll] = rpc('/* a\n b */\nconst r = await supabase\n  .rpc("x", {});');
  assert.equal(ll.linea, 4);
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

// Que leer cualquier archivo real no falle (un error de sintaxis o una sintaxis nueva no debe tumbar el informe) y que la
// lectura no se quede ciega: hoy hay ~300 llamadas `.rpc("…")` con nombre en apps/web.
test("la lectura recorre TODOS los archivos de apps/web sin fallar y encuentra las llamadas de siempre", () => {
  const archivos = archivosDeWeb(join(RAIZ, "apps", "web")).filter((r) => !esDePrueba(r));
  assert.ok(archivos.length > 100, "no se encontraron los archivos de apps/web");
  let conNombre = 0;
  let proveedores = null;
  for (const ruta of archivos) {
    const texto = readFileSync(ruta, "utf8");
    const llamadas = llamadasRpc(texto, ruta);
    nombresEntreComillas(texto, CONOCIDAS, ruta);
    conNombre += llamadas.filter((l) => l.nombre !== null).length;
    if (ruta.endsWith("components/ProveedoresPanel.tsx")) proveedores = llamadas;
  }
  assert.ok(conNombre > 250, `la lectura solo encontró ${conNombre} llamadas con nombre: ¿se quedó ciega?`);
  // El caso que motivó todo: Proveedores llama a dos funciones con un ternario.
  assert.ok(proveedores?.some((l) => l.nombresEnElNombre.includes("desactivar_proveedor") && l.nombresEnElNombre.includes("reactivar_proveedor")), "ProveedoresPanel.tsx ya no se lee como un ternario con las dos funciones");
});
