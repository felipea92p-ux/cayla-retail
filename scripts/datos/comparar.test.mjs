// Prueba de extremo a extremo de `comparar.mjs`: arma un repositorio de juguete (`COMPARAR_RAIZ`) por escenario y comprueba
// lo que el informe dice de él. Fija los comportamientos que costaron falsas alarmas (o falsas calmas) de verdad:
//   · un `.rpc("x")` en un comentario o en una prueba NO es una llamada;
//   · un comentario entre la coma y la clave NO hace que «no mande» ese parámetro (8 avisos falsos así);
//   · una expresión regular con comilla dentro del objeto no desordena las claves;
//   · las claves de un objeto ANIDADO no son parámetros;
//   · `.rpc("x" as never, …)` (Finanzas) cuenta como llamada, y sus parámetros de más se detectan;
//   · un ternario, un ayudante o un nombre calculado NO se aprueban: salen «no analizadas»;
//   · una llamada cuyos parámetros no se pueden leer, a una función que la foto no tiene, sale «sin respaldo» igual;
//   · una función que la foto no tiene sale «sin respaldo en la foto» (no «rota») y con la migración que la define.
// `node --test scripts/datos/comparar.test.mjs`. Necesita `typescript` (raíz del repo), como la lectura.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "comparar.mjs");
const FOTO = "2026-09-25T16:09:32.608839+00:00";
const raices = [];
after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Arma un repo de juguete: `firmas` son las líneas de funciones-produccion.txt; `archivos`, ruta → texto. */
function repo({ firmas, archivos, foto = FOTO, funcionesEnFoto }) {
  const raiz = mkdtempSync(join(tmpdir(), "comparar-"));
  raices.push(raiz);
  const escribir = (ruta, texto) => {
    const destino = join(raiz, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, texto);
  };
  escribir("docs/datos/generado/funciones-produccion.txt", firmas.join("\n") + "\n");
  if (foto) escribir("docs/datos/generado/retail_foto.json", JSON.stringify(funcionesEnFoto === undefined ? { leido_en: foto } : { leido_en: foto, funciones: funcionesEnFoto }));
  for (const [ruta, texto] of Object.entries(archivos)) escribir(ruta, texto);
  const correr = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, COMPARAR_RAIZ: raiz }, encoding: "utf8" });
  const md = () => {
    correr("--md");
    return readFileSync(join(raiz, "docs/datos/generado/DRIFT.md"), "utf8");
  };
  return { raiz, correr, md };
}

const firma = (nombre, ...params) => `${nombre}(${params.map((p) => `${p} integer`).join(", ")}) -> void [definer]`;

// ── El escenario grande: todo lo que ya costó una falsa alarma, junto ─────────────────────────────────────────────────
const grande = () =>
  repo({
    firmas: [
      "abrir_caja(p_ubicacion_id uuid, p_monto_apertura numeric, p_motivo_diferencia text) -> jsonb [definer]",
      firma("desactivar_proveedor", "p_proveedor_id"),
      firma("reactivar_proveedor", "p_proveedor_id"),
      firma("solo_comentada", "p_x"),
      firma("solo_en_prueba", "p_x"),
      firma("huerfana", "p_x"),
      firma("fn_interna", "p_x"),
    ],
    archivos: {
      "apps/web/components/A.tsx": [
        "export async function a(supabase, p, u, m) {",
        '  // supabase.rpc("solo_comentada", { p_x: 1 })',
        '  await supabase.rpc("abrir_caja", {',
        "    p_ubicacion_id: u,",
        "    // un comentario entre la coma y la clave",
        "    p_monto_apertura: 1,",
        "    // otro comentario",
        "    p_motivo_diferencia: m ? 1 : undefined,",
        "  });",
        '  await supabase.rpc(p.activo ? "desactivar_proveedor" : "reactivar_proveedor", { p_proveedor_id: 1 });',
        '  await supabase.rpc("no_esta_en_la_foto", { p_a: 1 });',
        "}",
        "",
      ].join("\n"),
      "apps/web/lib/a.test.ts": 'supabase.rpc("solo_en_prueba", { p_x: 1 });\n',
      "supabase/migrations/20260926000000_nueva.sql": "create or replace function retail.no_esta_en_la_foto(p_a integer) returns void language sql as $$ select 1 $$;\n",
    },
  });

test("un comentario entre la coma y la clave NO hace que «no mande» ese parámetro (no hay aviso de abrir_caja)", () => {
  const r = grande().correr();
  assert.ok(!/Avisos[\s\S]*abrir_caja/.test(r.stdout.split("No analizadas")[0]), `abrir_caja salió con un aviso falso:\n${r.stdout}`);
});

test("un `.rpc(\"x\")` en un comentario y otro en una prueba NO cuentan: las dos funciones salen «sin llamada»", () => {
  const r = grande().correr();
  const linea = r.stdout.split("\n").find((l) => l.includes("huerfana")) ?? "";
  assert.ok(linea.includes("solo_comentada") && linea.includes("solo_en_prueba") && linea.includes("huerfana"), `la lista fue: ${linea}`);
  assert.ok(!linea.includes("fn_interna"), "una `fn_*` no debe salir en «sin llamada»");
});

test("un ternario cuenta como que la pantalla usa las dos funciones, y sale «no analizada», nunca aprobada", () => {
  const r = grande().correr();
  const sinLlamada = r.stdout.split("\n").find((l) => l.includes("huerfana")) ?? "";
  assert.ok(!sinLlamada.includes("desactivar_proveedor") && !sinLlamada.includes("reactivar_proveedor"));
  assert.match(r.stdout, /desactivar_proveedor · apps\/web\/components\/A\.tsx:10 — el nombre va dentro de una expresión/);
  assert.match(r.stdout, /reactivar_proveedor · apps\/web\/components\/A\.tsx:10 — el nombre va dentro de una expresión/);
});

test("una función que la foto no tiene sale «sin respaldo en la foto», con su fecha y la migración que la crea", () => {
  const r = grande().correr();
  assert.match(r.stdout, /SIN RESPALDO EN LA FOTO DE PRODUCCIÓN — 1/);
  assert.match(r.stdout, /no_esta_en_la_foto[\s\S]*no está en la foto de producción \(2026-09-25 16:09 UTC\)/);
  assert.match(r.stdout, /la crea supabase\/migrations\/20260926000000_nueva\.sql/);
  assert.ok(!/ROTO EN PRODUCCIÓN/.test(r.stdout), "volvió a decir «roto en producción»");
});

test("la alarma sigue: sale con código 1, pero dice que NO es lo mismo que «pantalla rota»", () => {
  const r = grande().correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NO es lo mismo que «pantalla rota»/);
  assert.ok(!/encontró \d+ pantalla/.test(r.stdout), "afirma «encontró N pantallas rotas»");
});

test("el DRIFT.md dice la fecha de su foto, no promete que las funciones sin llamada sobren, y ordena sus secciones", () => {
  const md = grande().md();
  assert.match(md, /Foto de producción: 2026-09-25 16:09 UTC/);
  assert.match(md, /## Funciones sin llamada detectada desde `apps\/web` — 3/);
  assert.match(md, /NO prueba que sobren/);
  assert.ok(!md.includes("Funciones que nadie llama") && !md.includes("una función que sobra y habría que retirar"));
  const orden = ["## Llamadas sin respaldo en la foto", "## Sobrecargas", "## Avisos", "## No analizadas", "## Funciones sin llamada"].map((t) => md.indexOf(t));
  assert.ok(orden.every((n, i) => n >= 0 && (i === 0 || n > orden[i - 1])), `las secciones están en otro orden: ${orden}`);
  // La entrada sin respaldo cuelga de SU encabezado (antes salía bajo «Sobrecargas»).
  assert.ok(md.indexOf("### `no_esta_en_la_foto`") > md.indexOf("## Llamadas sin respaldo") && md.indexOf("### `no_esta_en_la_foto`") < md.indexOf("## Sobrecargas"));
});

test("el DRIFT.md trae las dos consultas de SQL, con `\\m` y `\\M` intactos, y dice qué alcance tiene la de los cuerpos", () => {
  const md = grande().md();
  assert.ok(md.includes("select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname = '<nombre>';"));
  assert.ok(md.includes("p.prosrc ~ ('\\m' || '<nombre>' || '\\M')"), "la consulta de cuerpos perdió `\\m`/`\\M`");
  assert.match(md, /SOLO\s+cuerpos de funciones de `retail`: los disparadores, las políticas de seguridad y los trabajos programados \(cron\) se miran aparte/);
  assert.match(md, /- \*\*Dónde:\*\* `apps\/web\/components\/A\.tsx:11`/);
  assert.match(md, /- \*\*Migración que la crea:\*\* `supabase\/migrations\/20260926000000_nueva\.sql`/);
  assert.match(md, /\*Foto\*: la lista de funciones de producción/);
});

// ── Las formas de llamar ─────────────────────────────────────────────────────────────────────────────────────────────

test("`.rpc(\"x\" as never, …)` (como Finanzas) cuenta como llamada: no sale «sin llamada» y un parámetro de más se detecta", () => {
  const r = repo({
    firmas: [firma("cerrar_periodo", "p_mes"), firma("no_llamada", "p_x")],
    archivos: { "apps/web/components/F.tsx": 'export const f = (s) => s.rpc("cerrar_periodo" as never, { p_mes: 1, p_de_mas: 2 } as never);\n' },
  }).correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Comparando 1 llamadas `\.rpc` de apps\/web contra 2 funciones de producción/);
  assert.match(r.stdout, /cerrar_periodo {2}· {2}apps\/web\/components\/F\.tsx:1/);
  assert.match(r.stdout, /manda `p_de_mas` y la foto de producción no lo acepta/);
  assert.ok(!/SIN llamada[\s\S]*cerrar_periodo/.test(r.stdout), "cerrar_periodo salió como «sin llamada» estando en una pantalla");
});

test("un parámetro que la función acepta y la pantalla no manda es un AVISO, no una alarma: código 0", () => {
  const r = repo({
    firmas: [firma("registrar_algo", "p_a", "p_b")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => s.rpc("registrar_algo", { p_a: 1 });\n' },
  }).correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Avisos \(parámetros no enviados\) — 1/);
  assert.match(r.stdout, /registrar_algo · apps\/web\/components\/G\.tsx:1 — no manda `p_b`/);
});

test("todo encaja: ninguna alarma y código 0", () => {
  const r = repo({
    firmas: [firma("registrar_algo", "p_a", "p_b")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => s.rpc("registrar_algo", { p_a: 1, p_b: 2 });\n' },
  }).correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Ninguna pantalla llama a una función con parámetros que la foto de producción no acepte/);
  assert.ok(!/ELIFECYCLE|SIN RESPALDO/.test(r.stdout));
});

test("las claves de un objeto ANIDADO no son parámetros: `variante_id` dentro de `p_items` no sale «de más»", () => {
  const r = repo({
    firmas: [firma("registrar_venta", "p_items", "p_sede")],
    archivos: {
      "apps/web/components/V.tsx": 'export const v = (s, xs) => s.rpc("registrar_venta", { p_items: xs.map((i) => ({ variante_id: i.id, cantidad: 1 })), p_sede: { id: 1 } });\n',
    },
  }).correr();
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!/parámetro de más|no manda/.test(r.stdout), r.stdout);
});

test("una expresión regular con comilla dentro del objeto no desordena las claves: ni aviso falso ni parámetro «de más»", () => {
  const r = repo({
    firmas: [firma("guardar_nota", "p_texto", "p_a", "p_b")],
    archivos: {
      "apps/web/components/N.tsx": ["export const n = (s, t) =>", "  s.rpc(\"guardar_nota\", {", "    p_texto: t.replace(/'/g, \"’\"),", "    p_a: 1,", "    p_b: 2,", "  });", ""].join("\n"),
    },
  }).correr();
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!/no manda|parámetro de más/.test(r.stdout), r.stdout);
});

test("un objeto armado con «...» no se puede leer: «no analizada», nunca aprobada, y la función NO sale «sin llamada»", () => {
  const r = repo({
    firmas: [firma("registrar_venta", "p_a")],
    archivos: { "apps/web/components/V.tsx": 'export const v = (s, resto) => s.rpc("registrar_venta", { ...resto, p_a: 1 });\n' },
  }).correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No analizadas — 1/);
  assert.match(r.stdout, /registrar_venta · apps\/web\/components\/V\.tsx:1 — el objeto se arma con «\.\.\.»/);
  assert.ok(!/SIN llamada/.test(r.stdout), r.stdout);
});

test("una llamada con los parámetros en una variable, a una función que la foto NO tiene, sale «sin respaldo» con su migración", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: {
      "apps/web/components/P.tsx": 'export const p = (s, params) => s.rpc("crear_producto_nuevo", params);\n',
      "supabase/migrations/20260926010000_producto.sql": "create function retail.crear_producto_nuevo(p_a integer) returns void language sql as $$ select 1 $$;\n",
    },
  }).correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SIN RESPALDO EN LA FOTO DE PRODUCCIÓN — 1/);
  assert.match(r.stdout, /crear_producto_nuevo {2}· {2}apps\/web\/components\/P\.tsx:1/);
  assert.match(r.stdout, /sus parámetros no se pudieron leer/);
  assert.match(r.stdout, /la crea supabase\/migrations\/20260926010000_producto\.sql/);
});

test("un nombre calculado (una variable) sale «no analizada» como «(nombre calculado)», no se pierde", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: { "apps/web/components/C.tsx": "export const c = (s, RPC) => s.rpc(RPC, { p_x: 1 });\n" },
  }).correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\(nombre calculado\) · apps\/web\/components\/C\.tsx:1 — el nombre de la función no va escrito ahí mismo/);
});

test("un ayudante que recibe el nombre entre comillas cuenta como «la pantalla usa la función» (no «sin llamada»)", () => {
  const r = repo({
    firmas: [firma("cerrar_periodo", "p_mes")],
    archivos: { "apps/web/components/H.tsx": 'export const h = () => llamar("cerrar_periodo", { p_mes: 1 });\n' },
  }).correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cerrar_periodo · apps\/web\/components\/H\.tsx:1 — el nombre va entre comillas pero no como `\.rpc\("…"\)` directo/);
  assert.ok(!/SIN llamada/.test(r.stdout), r.stdout);
});

// ── Las firmas y la foto ─────────────────────────────────────────────────────────────────────────────────────────────

test("una función con DOS firmas en producción sale en «Sobrecargas» (informe y DRIFT.md)", () => {
  const dos = repo({
    firmas: [firma("registrar_compra", "p_a"), firma("registrar_compra", "p_a", "p_b")],
    archivos: { "apps/web/components/K.tsx": 'export const k = (s) => s.rpc("registrar_compra", { p_a: 1, p_b: 2 });\n' },
  });
  const r = dos.correr();
  assert.match(r.stdout, /SOBRECARGAS EN PRODUCCIÓN — 1/);
  assert.match(r.stdout, /registrar_compra — 2 firmas/);
  assert.match(dos.md(), /## Sobrecargas — 1\n\n### `registrar_compra` — 2 firmas/);
});

test("sin `retail_foto.json` el informe lo dice («SIN FECHA») en vez de inventar una fecha", () => {
  const r = repo({
    firmas: [firma("registrar_algo", "p_a")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => s.rpc("registrar_algo", { p_a: 1 });\n' },
    foto: null,
  }).correr();
  assert.match(r.stdout, /Foto de producción: SIN FECHA/);
});

test("sin `funciones-produccion.txt` no hay contra qué comparar: sale con código 1 y dice qué falta", () => {
  const dir = mkdtempSync(join(tmpdir(), "comparar-"));
  raices.push(dir);
  mkdirSync(join(dir, "apps/web"), { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, COMPARAR_RAIZ: dir }, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Falta docs\/datos\/generado\/funciones-produccion\.txt/);
});

// ── Lo que las revisiones mostraron que no mordía ────────────────────────────────────────────────────────────────────

test("el titular dice de QUÉ son las cifras: llamadas leídas, directas sin leer y con nombre no literal", () => {
  const r = repo({
    firmas: [firma("a_leida", "p_x"), firma("b_spread", "p_x"), firma("c_tern", "p_x"), firma("d_tern", "p_x")],
    archivos: {
      "apps/web/components/T.tsx": [
        'export const t = (s, resto, c, RPC) => [',
        '  s.rpc("a_leida", { p_x: 1 }),',
        '  s.rpc("b_spread", { ...resto }),',
        '  s.rpc(c ? "c_tern" : "d_tern", {}),',
        '  s.rpc(RPC, {}),',
        '];',
        "",
      ].join("\n"),
    },
  }).correr();
  assert.match(r.stdout, /Comparando 4 llamadas `\.rpc` de apps\/web contra 4 funciones de producción/);
  assert.match(r.stdout, /\(1 con los parámetros leídos .*, 1 directas cuyos parámetros no se pudieron leer .*, 2 con el nombre en un ternario o una variable\)/);
});

test("un ternario con una función conocida y otra que la foto NO tiene: la ausente sale «sin respaldo» (antes desaparecía y el informe decía ✓)", () => {
  const r = repo({
    firmas: [firma("existente", "p_a")],
    archivos: {
      "apps/web/components/T.tsx": 'export const t = (s, c) => s.rpc(c ? "existente" : "nueva_sin_foto", { p_a: 1 });\n',
      "supabase/migrations/20260926020000_nueva.sql": "create function retail.nueva_sin_foto(p_a integer) returns void language sql as $$ select 1 $$;\n",
    },
  }).correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SIN RESPALDO EN LA FOTO DE PRODUCCIÓN — 1/);
  assert.match(r.stdout, /nueva_sin_foto {2}· {2}apps\/web\/components\/T\.tsx:1/);
  assert.match(r.stdout, /la crea supabase\/migrations\/20260926020000_nueva\.sql/);
  assert.ok(!/ Ninguna pantalla llama a una función con parámetros que la foto/.test(r.stdout), "el ✓ no puede decir que todo encaja");
});

test("una CONSTANTE con el nombre de una función que la foto no tiene pero una migración sí (`RPC_BAJADA`): sale «no analizada» con su migración", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: {
      "apps/web/lib/bajada-reglas.ts": 'export const RPC_BAJADA = "bajar_al_piso";\n',
      "apps/web/components/B.tsx": 'import { RPC_BAJADA } from "../lib/bajada-reglas";\nexport const b = (s) => s.rpc(RPC_BAJADA as never, { p_x: 1 } as never);\n',
      "supabase/migrations/20260926030000_bajada.sql": "create or replace function retail.bajar_al_piso(p_x integer) returns void language sql as $$ select 1 $$;\n",
    },
  }).correr();
  assert.match(r.stdout, /bajar_al_piso · apps\/web\/lib\/bajada-reglas\.ts:1 — el nombre va entre comillas .* la foto de producción NO tiene esa función; la crea supabase\/migrations\/20260926030000_bajada\.sql/);
  assert.match(r.stdout, /\(nombre calculado\) · apps\/web\/components\/B\.tsx:2/);
});

test("`.rpc(\"x\")` SIN argumentos se compara (no cae en «no analizada»): con parámetros que faltan es un aviso, sin parámetros todo encaja", () => {
  const con = repo({
    firmas: [firma("consulta_uno", "p_a"), firma("consulta_dos")],
    archivos: { "apps/web/components/Q.tsx": 'export const q = (s) => [s.rpc("consulta_uno"), s.rpc("consulta_dos")];\n' },
  }).correr();
  assert.equal(con.status, 0);
  assert.match(con.stdout, /Avisos \(parámetros no enviados\) — 1/);
  assert.match(con.stdout, /consulta_uno · apps\/web\/components\/Q\.tsx:1 — no manda `p_a`/);
  assert.ok(!/No analizadas/.test(con.stdout), con.stdout);
});

test("un objeto con «...» que además escribe una clave que la función no acepta: «parámetro de más» (falla siempre, haya o no un «...»)", () => {
  const r = repo({
    firmas: [firma("registrar_algo", "p_a")],
    archivos: { "apps/web/components/S.tsx": 'export const s = (s, resto) => s.rpc("registrar_algo", { ...resto, p_a: 1, p_inventada: 2 });\n' },
  }).correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /registrar_algo {2}· {2}apps\/web\/components\/S\.tsx:1/);
  assert.match(r.stdout, /manda `p_inventada` \(de los que se leen/);
});

test("`.rpc` usado como valor (`.bind`, `const { rpc } = x`) sale «no analizada» como «(alias de rpc)»: por ahí se llama sin que se vea", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: {
      "apps/web/app/api/x/route.ts": 'const rpcLibre = supabase.rpc.bind(supabase);\nexport const g = () => rpcLibre("ausente_fn", {});\n',
      "apps/web/lib/y.ts": "const { rpc } = supabase;\n",
    },
  }).correr();
  assert.match(r.stdout, /\(alias de rpc\) · apps\/web\/app\/api\/x\/route\.ts:1 — `\.rpc` se usa como valor \(\.rpc\.bind\(…\)\)/);
  assert.match(r.stdout, /\(alias de rpc\) · apps\/web\/lib\/y\.ts:1 — `\.rpc` se usa como valor \(`const \{ rpc \} = x`\)/);
});

test("un archivo con un error de sintaxis sale «no analizado»: sus llamadas pueden faltar y no se calla", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: { "apps/web/lib/roto.ts": 'export const a = {;\nsupabase.rpc("x", { p_x: 1 });\n' },
  }).correr();
  assert.match(r.stdout, /\(archivo entero\) · apps\/web\/lib\/roto\.ts:1 — el parser de TypeScript vio \d+ error(es)? de sintaxis/);
});

test("se leen los `.mts`, `.js` y `.jsx`; `node_modules` y las carpetas ocultas no", () => {
  const r = repo({
    firmas: [firma("f_mts", "p_x"), firma("f_js", "p_x"), firma("f_jsx", "p_x")],
    archivos: {
      "apps/web/lib/a.mts": 'export const a = (s) => s.rpc("f_mts", { p_x: 1, p_de_mas_mts: 1 });\n',
      "apps/web/lib/b.js": 'export const b = (s) => s.rpc("f_js", { p_x: 1, p_de_mas_js: 1 });\n',
      "apps/web/lib/c.jsx": 'export const C = (s) => <b onClick={() => s.rpc("f_jsx", { p_x: 1, p_de_mas_jsx: 1 })} />;\n',
      "apps/web/node_modules/pkg/index.ts": 'export const n = (s) => s.rpc("de_node_modules", {});\n',
      "apps/web/.oculto/o.ts": 'export const o = (s) => s.rpc("de_oculta", {});\n',
    },
  }).correr();
  assert.match(r.stdout, /Comparando 3 llamadas/);
  assert.match(r.stdout, /`p_de_mas_mts`/);
  assert.match(r.stdout, /`p_de_mas_js`/);
  assert.match(r.stdout, /`p_de_mas_jsx`/);
  assert.ok(!/de_node_modules|de_oculta/.test(r.stdout), r.stdout);
});

test("una llamada escrita en varias líneas cita la línea de `.rpc`, y una firma con dígitos se lee (`f_30d`)", () => {
  const r = repo({
    firmas: [firma("salidas_caja_30d", "p_a")],
    archivos: { "apps/web/lib/m.ts": 'export const m = (s) =>\n  s\n    .rpc("salidas_caja_30d", { p_a: 1, p_extra: 2 });\n' },
  }).correr();
  assert.match(r.stdout, /salidas_caja_30d {2}· {2}apps\/web\/lib\/m\.ts:3/);
  assert.match(r.stdout, /manda `p_extra`/);
});

test("tres firmas del mismo nombre: salen las tres en «Sobrecargas»", () => {
  const r = repo({
    firmas: [firma("f", "p_a"), firma("f", "p_a", "p_b"), firma("f", "p_a", "p_b", "p_c")],
    archivos: { "apps/web/components/K.tsx": 'export const k = (s) => s.rpc("f", { p_a: 1 });\n' },
  }).correr();
  assert.match(r.stdout, /f — 3 firmas/);
});

test("si dos migraciones definen la misma función, cita la última (y `CREATE FUNCTION` en mayúsculas también cuenta)", () => {
  const r = repo({
    firmas: [firma("otra", "p_x")],
    archivos: {
      "apps/web/components/M.tsx": 'export const m = (s) => s.rpc("dos_veces", { p_x: 1 });\n',
      "supabase/migrations/20260920000000_a.sql": "create function retail.dos_veces(p_x integer) returns void language sql as $$ select 1 $$;\n",
      "supabase/migrations/20260925000000_b.sql": "CREATE OR REPLACE FUNCTION retail.dos_veces(p_x integer) returns void language sql as $$ select 2 $$;\n",
    },
  }).correr();
  assert.match(r.stdout, /la crea supabase\/migrations\/20260925000000_b\.sql/);
});

test("`retail_foto.json` que cuenta otras funciones que el .txt: la fecha no es de fiar y el informe lo dice (foto refrescada a medias)", () => {
  const dos = repo({
    firmas: [firma("registrar_algo", "p_a")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => s.rpc("registrar_algo", { p_a: 1 });\n' },
    funcionesEnFoto: 544,
  });
  const r = dos.correr();
  assert.match(r.stdout, /Foto de producción: SIN FECHA\./);
  assert.match(r.stdout, /retail_foto\.json dice 544 funciones y funciones-produccion\.txt trae 1: no se refrescaron juntos/);
  assert.match(dos.md(), /⚠ \*\*retail_foto\.json dice 544 funciones y funciones-produccion\.txt trae 1/);
  // y cuando coinciden, no hay aviso y la fecha sale
  const bien = repo({
    firmas: [firma("registrar_algo", "p_a")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => s.rpc("registrar_algo", { p_a: 1 });\n' },
    funcionesEnFoto: 1,
  }).correr();
  assert.match(bien.stdout, /Foto de producción: 2026-09-25 16:09 UTC\./);
  assert.ok(!/no se refrescaron juntos/.test(bien.stdout));
});

test("el DRIFT.md lista cada aviso y cada función sin llamada (no solo sus conteos), y cuenta las `fn_*` que deja fuera", () => {
  const md = repo({
    firmas: [firma("con_aviso", "p_a", "p_b"), firma("sin_llamada_uno", "p_x"), firma("sin_llamada_dos", "p_x"), firma("fn_con_pantalla", "p_x"), firma("fn_sin_pantalla", "p_x")],
    archivos: { "apps/web/components/G.tsx": 'export const g = (s) => [s.rpc("con_aviso", { p_a: 1 }), s.rpc("fn_con_pantalla", { p_x: 1 })];\n' },
  }).md();
  assert.match(md, /- `con_aviso` · `apps\/web\/components\/G\.tsx:1` — no manda `p_b`/);
  assert.match(md, /^- `sin_llamada_uno`$/m);
  assert.match(md, /^- `sin_llamada_dos`$/m);
  const plano = md.replace(/\n> /g, " "); // los párrafos citados parten la frase con «> » al inicio de cada línea
  assert.match(plano, /Las `fn_\*` \(2 en la foto: en su mayoría disparadores, candados de dinero y ayudantes que llaman otras funciones\) se dejan fuera de «sin llamada» a propósito; 1 sí las nombra una pantalla y salen en las secciones de arriba, y a las otras 1 no las nombra ninguna pantalla y aquí no se listan/);
});

test("el DRIFT.md explica que las «No analizadas» son entradas y no llamadas, y dónde se ve lo de las funciones ausentes", () => {
  const md = grande().md();
  assert.match(md, /Comparadas 3 llamadas `\.rpc` de `apps\/web` contra 7 funciones/);
  assert.match(md, /son \*\*entradas, no llamadas\*\*/);
  assert.match(md, /Lo que aquí NO se ve: una llamada indirecta a una función que ni la\s+foto ni ninguna migración del repo conocen/);
  assert.match(md, /Solo si producción sigue así/);
  assert.ok(!md.includes("Si la foto estuviera al día"));
});

test("una función mencionada en dos archivos cita el PRIMERO (por orden alfabético), y una llamada directa no se repite como «mención»", () => {
  const r = repo({
    firmas: [firma("cerrar_periodo", "p_mes"), firma("solo_mencionada", "p_x")],
    archivos: {
      "apps/web/lib/z.ts": 'export const Z = "solo_mencionada";\n',
      "apps/web/lib/a.ts": 'export const A = "solo_mencionada";\n',
      "apps/web/components/C.tsx": 'export const c = (s) => s.rpc("cerrar_periodo", { p_mes: 1 });\nexport const N = "cerrar_periodo";\n',
    },
  }).correr();
  assert.match(r.stdout, /solo_mencionada · apps\/web\/lib\/a\.ts:1 —/);
  assert.ok(!/solo_mencionada · apps\/web\/lib\/z\.ts/.test(r.stdout), "citó el segundo archivo");
  assert.ok(!/cerrar_periodo · /.test(r.stdout), "una llamada directa ya leída no debe repetirse como «no analizada»");
  assert.match(r.stdout, /No analizadas — 1 /);
});
