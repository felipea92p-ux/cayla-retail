// Pruebas de la lectura de código de `comparar.mjs`. Sin más dependencia que `typescript` (ya está en la raíz):
// `node --test scripts/datos/comparar-lectura.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasesDeRpc, erroresDeSintaxis, esDePrueba, EXTENSIONES_DE_CODIGO, fechaDeLaFoto, llamadasRpc, nombresEntreComillas } from "./comparar-lectura.mjs";

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

test("lo que envuelve a un valor no lo cambia: `(x)`, `x!`, `x satisfies T` y `<T>x` se leen como `x`", () => {
  for (const nombre of ['("x1")', '"x1"!', '"x1" satisfies string', '<string>"x1"']) {
    const [ll] = rpc(`supabase.rpc(${nombre}, ({ p_a: 1 }) as never)`, "lib/f.ts"); // `.ts`: en un `.tsx` el `<T>x` es JSX
    assert.equal(ll.nombre, "x1", nombre);
    assert.deepEqual(ll.claves, ["p_a"], nombre);
  }
});

test("una plantilla SIN partes es un texto: `.rpc(`x`)` es la función x; con partes no", () => {
  assert.equal(rpc("supabase.rpc(`x2`, {})")[0].nombre, "x2");
  assert.equal(rpc("supabase.rpc(`x_${a}`, {})")[0].nombre, null);
});

test("una clave entre comillas o con número se lee: `{ \"p_a\": 1 }`", () => {
  assert.deepEqual(rpc('supabase.rpc("f", { "p_a": 1, p_b: 2 })')[0].claves, ["p_a", "p_b"]);
});

test("las claves escritas ahí mismo se leen aunque el objeto lleve «...» (una clave que la función no acepta falla siempre)", () => {
  const [ll] = rpc('supabase.rpc("f", { ...resto, p_a: 1 })');
  assert.equal(ll.argumentos, "objeto con spread");
  assert.deepEqual(ll.claves, ["p_a"]);
});

test("los textos posibles del nombre son los de un ternario o de `||` / `??`, no los de una llave (`MAPA[\"x\"]`) ni los de un argumento", () => {
  assert.deepEqual(rpc('supabase.rpc(a || "uno", {})')[0].nombresEnElNombre, ["uno"]);
  assert.deepEqual(rpc('supabase.rpc(a ?? "uno", {})')[0].nombresEnElNombre, ["uno"]);
  assert.deepEqual(rpc('supabase.rpc(a ? (b ? "uno" : "dos") : "tres", {})')[0].nombresEnElNombre, ["uno", "dos", "tres"]);
  assert.deepEqual(rpc('supabase.rpc(MAPA["abrir"], {})')[0].nombresEnElNombre, []);
  assert.deepEqual(rpc('supabase.rpc(nombreDe("abrir"), {})')[0].nombresEnElNombre, []);
});

test("un `.js` y un `.jsx` también se leen, y el `.jsx` se lee como JSX (sin errores de sintaxis)", () => {
  assert.deepEqual(rpc('export const f = (s) => s.rpc("x3", { p_a: 1 });', "lib/f.js").map((l) => l.nombre), ["x3"]);
  const jsx = 'export const F = (s) => <b onClick={() => s.rpc("x4", {})} />;';
  assert.deepEqual(rpc(jsx, "components/F.jsx").map((l) => l.nombre), ["x4"]);
  assert.equal(erroresDeSintaxis(jsx, "components/F.jsx"), 0);
});

test("solo es una llamada de supabase el método que se llama EXACTAMENTE `rpc` (`rpcTipado`, `rpc2` no)", () => {
  assert.deepEqual(rpc('s.rpcTipado("x5", {}); s.rpc2("x6"); s.myrpc("x7");'), []);
});

// ---- aliasesDeRpc --------------------------------------------------------------------------------------------------

const alias = (texto, ruta) => aliasesDeRpc(texto, ruta).map((a) => a.forma);

test("`.rpc` usado como valor se avisa: `.bind`, `const { rpc } = x`, `x[\"rpc\"]`, un cast, `const f = x.rpc`", () => {
  assert.deepEqual(alias("const r = s.rpc.bind(s);"), [".rpc.bind(…)"]);
  assert.deepEqual(alias("const { rpc } = s;"), ["`const { rpc } = x`"]);
  assert.deepEqual(alias("const { rpc: llamar } = s;"), ["`const { rpc } = x`"]);
  assert.deepEqual(alias('s["rpc"]("x")'), ['x["rpc"]']);
  assert.deepEqual(alias('(s.rpc as unknown as (f: string) => void)("x")'), ["se llama con un cast: `(x.rpc as …)(…)`"]);
  assert.deepEqual(alias("const f = s.rpc;"), ["se guarda en una variable"]);
  assert.deepEqual(alias("let f; f = s.rpc;"), ["se guarda en una variable"]);
});

test("la llamada directa y un campo cualquiera llamado «rpc» NO son un alias (`op.rpc === \"x\"` es de la cola offline)", () => {
  assert.deepEqual(alias('await s.rpc("x", {}); createClient().rpc("y");'), []);
  assert.deepEqual(alias('ops.filter((op) => op.rpc === "recibir_envio"); const o = { rpc: "x" }; type T = S["rpc"];'), []);
});

test("la línea del alias es la de su uso", () => {
  assert.deepEqual(aliasesDeRpc("\n\nconst r = s.rpc.bind(s);").map((a) => a.linea), [3]);
});

// ---- erroresDeSintaxis ---------------------------------------------------------------------------------------------

test("un archivo con un error de sintaxis se cuenta (el parser sigue y devuelve un árbol truncado, sin lanzar)", () => {
  assert.equal(erroresDeSintaxis("export const a = 1;\nsupabase.rpc('x', { p_a: 1 });\n"), 0);
  assert.ok(erroresDeSintaxis("export const a = {;\nsupabase.rpc('x', { p_a: 1 });\n") > 0);
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

test("las pruebas no son pantallas, con cualquiera de sus extensiones", () => {
  assert.equal(esDePrueba("apps/web/lib/x.test.js"), true);
  assert.equal(esDePrueba("apps/web/lib/x.test.mjs"), true);
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
    else if (EXTENSIONES_DE_CODIGO.test(e)) acc.push(r);
  }
  return acc;
}

// Que leer cualquier archivo real no falle (una sintaxis nueva no debe tumbar el informe) y que la lectura no se quede ciega.
// OJO: esta prueba corre en el CI de TODOS los PR y lee el código de esos PR. Por eso solo exige lo grueso (que recorra y que
// encuentre «bastantes» llamadas, hoy ~300): NO se ata a la forma de un archivo concreto ni a un número exacto, para que un
// refactor ajeno no la ponga en rojo. Los casos finos están en las pruebas de arriba, con texto de juguete.
test("la lectura recorre TODOS los archivos de apps/web sin fallar y no se queda ciega", () => {
  const archivos = archivosDeWeb(join(RAIZ, "apps", "web")).filter((r) => !esDePrueba(r));
  assert.ok(archivos.length > 100, "no se encontraron los archivos de apps/web");
  let conNombre = 0;
  for (const ruta of archivos) {
    const texto = readFileSync(ruta, "utf8");
    conNombre += llamadasRpc(texto, ruta).filter((l) => l.nombre !== null).length;
    nombresEntreComillas(texto, CONOCIDAS, ruta);
    aliasesDeRpc(texto, ruta);
    erroresDeSintaxis(texto, ruta);
  }
  assert.ok(conNombre > 100, `la lectura solo encontró ${conNombre} llamadas con nombre en apps/web: ¿se quedó ciega? (si este PR movió las llamadas a otra forma, revisa comparar-lectura.mjs; el fallo no es de tu código)`);
});
