/**
 * Pruebas de los tres escáneres de rendimiento. Cada uno recibe código MALO conocido (debe marcarlo, con la bandera exacta) y código
 * BUENO conocido (debe callar): un escáner que marca todo o nada no sirve. Los casos buenos incluyen las convenciones del repo
 * (`exigir(...)`, `Promise.all`) porque la primera versión del escáner de observabilidad las marcó como fallas (308 falsos positivos).
 *
 * Correr:  node --test scripts/rendimiento/rendimiento.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analizarTexto } from "./arboles.mjs";
import { analizarArchivo as ui } from "./ui.mjs";
import { analizarArchivo as obs } from "./observabilidad.mjs";

const banderas = (src) => analizarTexto(src, "x.ts").flatMap((f) => f.banderas);

// ───────────── Árboles de decisión ─────────────
test("árboles: una escalera if/else-if de 6 eslabones se marca `escalera`", () => {
  const src = `export function f(x: number) {
    if (x === 1) return "a"; else if (x === 2) return "b"; else if (x === 3) return "c";
    else if (x === 4) return "d"; else if (x === 5) return "e"; else if (x === 6) return "f";
    return "z";
  }`;
  const r = analizarTexto(src);
  assert.equal(r.length, 1);
  assert.equal(r[0].escalera, 6);
  assert.ok(r[0].banderas.includes("escalera"));
});

test("árboles: cinco niveles de anidamiento se marcan `profunda` y la ausencia de guardas `sin-guardas`", () => {
  const src = `export function f(a: any) {
    let n = 0;
    if (a.x) { if (a.y) { for (const i of a.z) { if (i.w) { if (i.v && i.u || i.t) { n++; } } } } }
    if (a.a1) n++; if (a.a2) n++; if (a.a3) n++; if (a.a4) n++; if (a.a5) n++;
    return n;
  }`;
  const b = banderas(src);
  assert.ok(b.includes("profunda"));
  assert.ok(b.includes("sin-guardas"));
  // Una lista plana de avisos (CC alta, sin anidamiento) NO pide guardas: era el 80 % del ruido en lib/.
  const plana = `export function avisos(a: any) { const r: string[] = []; ${Array.from({ length: 12 }, (_, i) => `if (a.k${i}) r.push("x${i}");`).join(" ")} return r; }`;
  assert.ok(!banderas(plana).includes("sin-guardas"));
});

test("árboles: la misma condición larga dos veces se marca `reevalua`", () => {
  const src = `export function f(p: any) {
    if (p.stock > 0 && !p.apartada && p.activa) { return 1; }
    const y = p.stock > 0 && !p.apartada && p.activa ? 2 : 3;
    return y;
  }`;
  assert.ok(banderas(src).includes("reevalua"));
});

test("árboles: dos `else` después de return se marcan `else-sobra`", () => {
  const src = `export function f(a: number, b: number) {
    if (a > 1) { return 1; } else { b++; }
    if (b > 1) { return 2; } else { b--; }
    return b;
  }`;
  assert.ok(banderas(src).includes("else-sobra"));
});

test("árboles: una función plana con guardas NO se marca (el caso bueno callado)", () => {
  const src = `export function f(p: { stock: number; apartada: boolean } | null) {
    if (!p) return "sin";
    if (p.apartada) return "apartada";
    if (p.stock <= 0) return "agotada";
    return "ok";
  }`;
  assert.deepEqual(banderas(src), []);
});

test("árboles: una tabla de decisión NO se marca", () => {
  const src = `const TABLA = [{ max: 5, v: "a" }, { max: 10, v: "b" }, { max: 20, v: "c" }, { max: 50, v: "d" }, { max: 99, v: "e" }, { max: 200, v: "f" }];
  export const f = (n: number) => TABLA.find((t) => n <= t.max)?.v ?? "z";`;
  assert.deepEqual(banderas(src), []);
});

test("árboles: el `else if` no cuenta como un nivel más de anidamiento", () => {
  const src = `export function f(x: number) { if (x === 1) return 1; else if (x === 2) return 2; else if (x === 3) return 3; return 0; }`;
  const f = analizarTexto(src, "x.ts", { cc: 1, profundidad: 4, escalera: 99, guardas: 99, repetida: 2 });
  assert.equal(f[0].profundidad, 1);
});

// ───────────── Velocidad percibida ─────────────
test("ui: awaits seguidos suman cascada; en Promise.all no", () => {
  const mala = ui(`export default async function P() { const a = await uno(); const b = await dos(a); const c = await tres(b); return <div/>; }`, "page.tsx");
  assert.equal(mala.cascada, 3);
  const buena = ui(`export default async function P() { const [a, b, c] = await Promise.all([uno(), dos(), tres()]); return <div/>; }`, "page.tsx");
  assert.equal(buena.cascada, 1);
});

test("ui: un await dentro de un `if`, createClient() y searchParams no suman cascada (calibración tras /vender)", () => {
  const r = ui(`export default async function P({ searchParams }: any) {
    const { a } = await searchParams; const supabase = await createClient(); const persona = await exigirModulo("vender");
    const [x, y] = await Promise.all([uno(), dos()]);
    if (a) { const p = await proforma(a); }
    const z = x ? await otro() : null;
    return <div/>; }`, "page.tsx");
  assert.equal(r.cascada, 2); // exigirModulo + el Promise.all; el resto es barato o condicional
});

test("ui: detecta `<img>`, `next/image` fill sin sizes, Suspense y modales", () => {
  const r = ui(`import Image from "next/image"; import { Suspense } from "react";
    export default function P() { return <Suspense fallback={null}><img src="a"/><Image src="b" fill alt=""/><Modal/><ModalRuta/></Suspense>; }`, "page.tsx");
  assert.equal(r.imgCruda, 1);
  assert.equal(r.imgSinSizes, 1);
  assert.equal(r.suspense, true);
  assert.equal(r.modales, 2);
});

test("ui: `use client` se detecta aunque haya un comentario antes; `next/dynamic` se reconoce", () => {
  const r = ui(`// nota\n"use client";\nimport dynamic from "next/dynamic";\nexport default function C() { return null; }`, "c.tsx");
  assert.equal(r.cliente, true);
  assert.equal(r.dinamico, true);
});

test("ui: un Server Component sin nada raro no marca nada", () => {
  const r = ui(`export default async function P() { const d = await leer(); return <ul>{d.map(x => <li key={x}>{x}</li>)}</ul>; }`, "page.tsx");
  assert.equal(r.cliente, false);
  assert.equal(r.imgCruda, 0);
  assert.equal(r.cascada, 1);
});

// ───────────── Observabilidad ─────────────
const tipos = (src, nombre = "x.ts") => obs(src, nombre).map((h) => h.tipo);

test("obs: `await supabase.rpc(...)` suelto es `rpc-descartada`", () => {
  assert.deepEqual(tipos(`export async function f(s: any) { await s.rpc("registrar_venta", {}); }`), ["rpc-descartada"]);
});

test("obs: `{ data }` sin `error` es `rpc-ignora-error`; con `error` o envuelta en exigir() NO", () => {
  assert.deepEqual(tipos(`export async function f(s: any) { const { data } = await s.rpc("fn_x"); return data; }`), ["rpc-ignora-error"]);
  assert.deepEqual(tipos(`export async function f(s: any) { const { data, error } = await s.rpc("fn_x"); if (error) throw error; return data; }`), []);
  assert.deepEqual(tipos(`export async function f(s: any) { return exigir(await s.rpc("fn_x"), "las filas"); }`), []);
  assert.deepEqual(tipos(`export async function f(s: any) { const r = await firmar(s.rpc("x", {}).setHeader("x-espera", "no"), firma); return r; }`), []);
});

test("obs: dentro de Promise.all se mira el patrón de la posición correcta", () => {
  assert.deepEqual(tipos(`export async function f(s: any) { const [{ data: a, error }, { data: b }] = await Promise.all([s.rpc("a"), s.rpc("b")]); return [a, b, error]; }`), ["rpc-ignora-error"]);
  assert.deepEqual(tipos(`export async function f(s: any) { const [r1, r2] = await Promise.all([s.rpc("a"), s.rpc("b")]); return [exigir(r1, "a"), exigir(r2, "b")]; }`), []);
});

test("obs: `catch` vacío y `catch` que solo hace console son `catch-mudo`; el que relanza no", () => {
  assert.ok(tipos(`export function f() { try { a(); } catch {} }`).includes("catch-mudo"));
  assert.ok(tipos(`export function f() { try { a(); } catch (e) { console.error(e); } }`).includes("catch-mudo"));
  assert.ok(!tipos(`export function f() { try { a(); } catch (e) { console.error(e); throw e; } }`).includes("catch-mudo"));
});

test("obs: `console.*` con un dato personal se marca; en un componente cliente el console suelto NO cuenta", () => {
  assert.ok(tipos(`export function f(dni: string) { console.log("cliente", dni); }`).includes("dato-personal-en-log"));
  assert.ok(!tipos(`"use client";\nexport function F() { console.log("x"); return null; }`, "F.tsx").includes("console-suelto"));
  assert.ok(tipos(`export function f() { console.log("x"); }`).includes("console-suelto"));
});

test("obs: `fetch` a un proveedor sin `signal` se marca; con `AbortSignal.timeout` no", () => {
  assert.ok(tipos(`export async function f() { return fetch("https://api.apis.net.pe/v2/dni", { headers: {} }); }`).includes("fetch-sin-tope"));
  assert.ok(!tipos(`export async function f() { return fetch("https://api.apis.net.pe/v2/dni", { signal: AbortSignal.timeout(5000) }); }`).includes("fetch-sin-tope"));
});

test("obs: una Server Action sin log, throw ni error se marca `accion-sin-rastro`", () => {
  assert.ok(tipos(`"use server";\nexport async function guardar(x: number) { return x + 1; }`).includes("accion-sin-rastro"));
  assert.ok(!tipos(`"use server";\nexport async function guardar(x: number) { if (!x) throw new Error("falta"); return x; }`).includes("accion-sin-rastro"));
});

test("obs: `.rpc().then(({ error }) => …)` NO es `rpc-descartada` (falso positivo hallado en CerrarCajaModalV2 y VentasDeHoy)", () => {
  assert.deepEqual(tipos(`export function f(s: any) { s.rpc("fn_x").then(({ error }: any) => { if (error) alert("no"); }); }`), []);
});

// ───────────── Relleno silencioso (ADR-0693) ─────────────
// Un relleno pone un valor en lugar del error y nadie se entera: el historial «vacío» que en verdad no cargó. Unos son a propósito
// (una parte opcional de la pantalla) y otros esconden una falla. La regla: el que es a propósito lo dice en su línea.
const rellenos = (src, nombre = "x.ts") => obs(src, nombre).filter((h) => h.tipo === "relleno-silencioso");

test("relleno: `.catch(() => null|[]|{}|undefined|false|\"\")` y `.catch(() => {})` se marcan; el detalle dice qué pone", () => {
  for (const cuerpo of ["null", "[]", "({})", "undefined", "false", '""', "{}", "{ return null; }", "({ data: null })", "new Map()", "fallback"]) {
    const r = rellenos(`export async function f(x: any, fallback: any) { return x().catch(() => ${cuerpo}); }`);
    assert.equal(r.length, 1, `.catch(() => ${cuerpo})`);
  }
  assert.match(rellenos(`export const f = (x: any) => x().catch(() => [])`)[0].detalle, /\[\]/);
  assert.equal(rellenos(`export const f = (x: any) => x().catch(() => {})`)[0].detalle, "vacío");
});

test("relleno: un `catch` que solo devuelve un valor vacío se marca (antes contaba como tratado por llevar `return`)", () => {
  for (const ret of ["return null;", "return [];", "return {};", "return false;", "return;", "return new Set();"]) {
    assert.equal(rellenos(`export function f(t: string) { try { return JSON.parse(t); } catch { ${ret} } }`).length, 1, ret);
  }
  // `unstable_rethrow` solo deja pasar los avisos internos de Next: el resto de los errores sigue tragándose.
  assert.equal(rellenos(`export async function f() { try { return await leer(); } catch (e) { unstable_rethrow(e); return []; } }`).length, 1);
  // Y ya no cuenta como `catch-mudo` (es otro hallazgo, con su propia salida).
  assert.ok(!tipos(`export function f(t: string) { try { return JSON.parse(t); } catch { return null; } }`).includes("catch-mudo"));
});

test("relleno: el que avisa, relanza, usa el error o hace algo más NO es relleno", () => {
  const callados = [
    `x().catch((e: unknown) => ({ data: null, error: { message: String(e) } }))`, // convierte el error en un resultado
    `x().catch((e: unknown) => { console.error("no se pudo", e); return null; })`,
    `x().catch(() => { capturarError("x", null); return []; })`,
    `x().catch(() => { avisar.error("No se pudo leer"); return null; })`,
    `x().catch(() => { throw new Error("otra cosa"); })`,
    `x().catch(() => { incompleto = true; return []; })`, // deja una señal que la pantalla lee
    `x().catch(() => setFallo(true))`,
    `x().catch(manejar)`, // una referencia: lo decide quien la escribe
  ];
  for (const c of callados) assert.deepEqual(rellenos(`export async function f(x: any) { let incompleto = false; ${c}; return incompleto; }`), [], c);
  assert.deepEqual(rellenos(`export function f(t: string) { try { return JSON.parse(t); } catch (e) { console.error(e); return null; } }`), []);
  assert.deepEqual(rellenos(`export function f(t: string) { try { return JSON.parse(t); } catch (e) { return { error: String(e) }; } }`), []);
  assert.deepEqual(rellenos(`export function f(t: string) { try { return JSON.parse(t); } catch { return error("No llegó", 400); } }`), []);
  // Lo que lleva el aviso dentro se lo dice a la persona (falsos positivos de la primera corrida: subir una foto, el ritmo de Análisis).
  assert.deepEqual(rellenos(`export async function f(x: any) { return x().catch(() => "No se pudo hablar con el servidor. Reintenta."); }`), []);
  assert.deepEqual(rellenos(`export function f(t: string) { try { return JSON.parse(t); } catch { return { error: "Este navegador no puede leer esa imagen." }; } }`), []);
  assert.deepEqual(rellenos(`export async function f(x: any, TEXTO: string) { return x().catch(() => ({ datos: null, fallo: TEXTO })); }`), []);
  // Pero un `error: null` no avisa nada: sigue siendo relleno.
  assert.equal(rellenos(`export async function f(x: any) { return x().catch(() => ({ data: [], error: null })); }`).length, 1);
});

test("relleno: el cuerpo de una respuesta (`res.json().catch(() => null)`) no cuenta: la falla ya se ve en `res.ok`", () => {
  assert.deepEqual(rellenos(`export async function f(r: Response) { const b = await r.json().catch(() => null); return r.ok ? b : null; }`), []);
  assert.deepEqual(rellenos(`export async function f(r: Request) { return (await r.text().catch(() => "")).length; }`), []);
});

test("relleno: la marca `relleno-a-proposito:` con su motivo lo calla en su línea, en el comentario de arriba o dentro del manejador", () => {
  const motivo = "relleno-a-proposito: opcional; si falla, la ficha se pinta sin el historial";
  assert.deepEqual(rellenos(`export const f = (x: any) => x().catch(() => []); // ${motivo}`), []);
  assert.deepEqual(rellenos(`export const f = (x: any) =>\n  // ${motivo}\n  // (segunda línea del mismo comentario)\n  x().catch(() => []);`), []);
  assert.deepEqual(rellenos(`export function f(t: string) {\n  try {\n    return JSON.parse(t);\n  } catch {\n    // ${motivo}\n    return null;\n  }\n}`), []);
  assert.deepEqual(rellenos(`export const f = (x: any) => x().catch(() => {\n  // ${motivo}\n});`), []);
});

test("relleno: la marca sin motivo, con uno corto o lejos del relleno NO lo calla", () => {
  assert.equal(rellenos(`export const f = (x: any) => x().catch(() => []); // relleno-a-proposito:`).length, 1);
  assert.equal(rellenos(`export const f = (x: any) => x().catch(() => []); // relleno-a-proposito: corto`).length, 1);
  // Un comentario con la marca, una línea de código y recién el relleno: la marca es de otro.
  assert.equal(rellenos(`// relleno-a-proposito: opcional; si falla, se pinta vacío\nconst a = 1;\nexport const f = (x: any) => x().catch(() => a);`).length, 1);
  // Y la marca de un relleno no calla al de la línea siguiente.
  assert.equal(rellenos(`export const f = (x: any) => [\n  x().catch(() => []), // relleno-a-proposito: opcional; si falla, se pinta vacío\n  x().catch(() => null),\n];`).length, 1);
});

test("relleno: el hallazgo apunta a la línea del `catch`, no al principio de la cadena", () => {
  const r = rellenos(`export const f = (s: any) =>\n  s\n    .from("x")\n    .select("*")\n    .catch(() => null);`);
  assert.equal(r[0].linea, 5);
});
