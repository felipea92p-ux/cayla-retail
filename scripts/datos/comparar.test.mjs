// Prueba de extremo a extremo de `comparar.mjs`: arma un repositorio de juguete (`COMPARAR_RAIZ`) y comprueba lo que el
// informe dice de él. Fija los comportamientos que costaron falsas alarmas de verdad:
//   · un `.rpc("x")` en un comentario o en una prueba NO es una llamada;
//   · un comentario entre la coma y la clave NO hace que «no mande» ese parámetro (8 avisos falsos así);
//   · un ternario o un ayudante SÍ cuentan como que la pantalla usa la función;
//   · una función que la foto no tiene sale «sin respaldo en la foto» (no «rota») y con la migración que la define.
// `node --test scripts/datos/comparar.test.mjs`. Necesita `typescript` (raíz del repo), como la lectura.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "comparar.mjs");
let raiz;

function escribir(ruta, texto) {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
}

const correr = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, COMPARAR_RAIZ: raiz }, encoding: "utf8" });

before(() => {
  raiz = mkdtempSync(join(tmpdir(), "comparar-"));
  escribir(
    "docs/datos/generado/funciones-produccion.txt",
    [
      "abrir_caja(p_ubicacion_id uuid, p_monto_apertura numeric, p_motivo_diferencia text) -> jsonb [definer]",
      "desactivar_proveedor(p_proveedor_id uuid) -> void [definer]",
      "reactivar_proveedor(p_proveedor_id uuid) -> void [definer]",
      "solo_comentada(p_x integer) -> void [definer]",
      "solo_en_prueba(p_x integer) -> void [definer]",
      "huerfana(p_x integer) -> void [definer]",
      "fn_interna(p_x integer) -> void [definer]",
      "",
    ].join("\n"),
  );
  escribir("docs/datos/generado/retail_foto.json", JSON.stringify({ leido_en: "2026-09-25T16:09:32.608839+00:00", funciones: 7 }));
  escribir(
    "apps/web/components/A.tsx",
    [
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
  );
  escribir("apps/web/lib/a.test.ts", 'supabase.rpc("solo_en_prueba", { p_x: 1 });\n');
  escribir("supabase/migrations/20260926000000_nueva.sql", "create or replace function retail.no_esta_en_la_foto(p_a integer) returns void language sql as $$ select 1 $$;\n");
});

after(() => rmSync(raiz, { recursive: true, force: true }));

test("un comentario entre la coma y la clave NO hace que «no mande» ese parámetro (no hay aviso de abrir_caja)", () => {
  const r = correr();
  assert.ok(!/Avisos[\s\S]*abrir_caja/.test(r.stdout.split("No analizadas")[0]), `abrir_caja salió con un aviso falso:\n${r.stdout}`);
});

test("un `.rpc(\"x\")` en un comentario y otro en una prueba NO cuentan: las dos funciones salen «sin llamada»", () => {
  const r = correr();
  const linea = r.stdout.split("\n").find((l) => l.includes("huerfana")) ?? "";
  assert.ok(linea.includes("solo_comentada") && linea.includes("solo_en_prueba") && linea.includes("huerfana"), `la lista fue: ${linea}`);
});

test("un ternario cuenta como que la pantalla usa las dos funciones, y sale «no analizada», nunca aprobada", () => {
  const r = correr();
  const sinLlamada = r.stdout.split("\n").find((l) => l.includes("huerfana")) ?? "";
  assert.ok(!sinLlamada.includes("desactivar_proveedor") && !sinLlamada.includes("reactivar_proveedor"));
  assert.match(r.stdout, /desactivar_proveedor · apps\/web\/components\/A\.tsx:\d+ — el nombre va entre comillas/);
  assert.match(r.stdout, /reactivar_proveedor · apps\/web\/components\/A\.tsx:\d+ — el nombre va entre comillas/);
});

test("una función que la foto no tiene sale «sin respaldo en la foto», con su fecha y la migración que la define", () => {
  const r = correr();
  assert.match(r.stdout, /SIN RESPALDO EN LA FOTO DE PRODUCCIÓN — 1/);
  assert.match(r.stdout, /no_esta_en_la_foto[\s\S]*no está en la foto de producción \(2026-09-25 16:09 UTC\)/);
  assert.match(r.stdout, /definida en supabase\/migrations\/20260926000000_nueva\.sql/);
  assert.ok(!/ROTO EN PRODUCCIÓN/.test(r.stdout), "volvió a decir «roto en producción»");
});

test("la alarma sigue: sale con código 1, pero dice que NO es lo mismo que «pantalla rota»", () => {
  const r = correr();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NO es lo mismo que «pantalla rota»/);
  assert.ok(!/encontró \d+ pantalla/.test(r.stdout), "afirma «encontró N pantallas rotas»");
});

test("el DRIFT.md dice la fecha de su foto, no promete que las funciones sin llamada sobren, y ordena sus secciones", () => {
  correr("--md");
  const md = readFileSync(join(raiz, "docs/datos/generado/DRIFT.md"), "utf8");
  assert.match(md, /Foto de producción: 2026-09-25 16:09 UTC/);
  assert.match(md, /## Funciones sin llamada detectada desde `apps\/web` — 3/);
  assert.match(md, /NO prueba que sobren/);
  assert.ok(!md.includes("Funciones que nadie llama") && !md.includes("una función que sobra y habría que retirar"));
  const orden = ["## Llamadas sin respaldo en la foto", "## Sobrecargas", "## Avisos", "## No analizadas", "## Funciones sin llamada"].map((t) => md.indexOf(t));
  assert.ok(orden.every((n, i) => n >= 0 && (i === 0 || n > orden[i - 1])), `las secciones están en otro orden: ${orden}`);
  // La entrada sin respaldo cuelga de SU encabezado (antes salía bajo «Sobrecargas»).
  assert.ok(md.indexOf("### `no_esta_en_la_foto`") > md.indexOf("## Llamadas sin respaldo") && md.indexOf("### `no_esta_en_la_foto`") < md.indexOf("## Sobrecargas"));
});
