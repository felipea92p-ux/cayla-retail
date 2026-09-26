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
function repo({ firmas, archivos, foto = FOTO }) {
  const raiz = mkdtempSync(join(tmpdir(), "comparar-"));
  raices.push(raiz);
  const escribir = (ruta, texto) => {
    const destino = join(raiz, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, texto);
  };
  escribir("docs/datos/generado/funciones-produccion.txt", firmas.join("\n") + "\n");
  if (foto) escribir("docs/datos/generado/retail_foto.json", JSON.stringify({ leido_en: foto }));
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
  assert.match(r.stdout, /Comparando 1 llamadas directas/);
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
