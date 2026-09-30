// Pruebas del check «SQL pegado». Sin dependencias: `node --test scripts/migraciones/sql-pegado.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { revisarSqlPegado } from "./sql-pegado.mjs";

const nueva = { filename: "supabase/migrations/20260929100000_algo.sql", status: "added" };
const web = { filename: "apps/web/lib/algo.ts", status: "modified" };

/** Corre el script como `sql-pegado.yml`: la lista de archivos tal como la da `gh api … --paginate --slurp`. */
function correr(paginas, cuerpo) {
  const dir = mkdtempSync(join(tmpdir(), "sql-pegado-"));
  writeFileSync(join(dir, "archivos.json"), JSON.stringify(paginas));
  writeFileSync(join(dir, "cuerpo.md"), cuerpo);
  const script = join(dirname(fileURLToPath(import.meta.url)), "sql-pegado.mjs");
  const r = spawnSync(process.execPath, [script, join(dir, "archivos.json"), join(dir, "cuerpo.md")], { encoding: "utf8" });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

test("sin migraciones no pide nada, marque lo que marque", () => {
  assert.deepEqual(revisarSqlPegado([web], "").motivos, []);
});

test("una migración nueva sin casilla sale roja y la nombra", () => {
  const r = revisarSqlPegado([web, nueva], "- [ ] **SQL pegado en producción.** …");
  assert.equal(r.motivos.length, 1);
  assert.match(r.motivos[0], /20260929100000_algo\.sql/);
});

test("con cualquiera de las dos casillas marcada sale verde (x o X, con o sin negrita)", () => {
  assert.equal(revisarSqlPegado([nueva], "- [x] **SQL pegado en producción.** Cada migración…").casilla, "pegado");
  assert.deepEqual(revisarSqlPegado([nueva], "* [X] SQL pegado en produccion").motivos, []);
  assert.equal(revisarSqlPegado([nueva], "- [x] **El SQL se pega después de fusionar**, porque…").casilla, "despues");
});

test("el texto de la casilla sin marcar, o citado en otra línea, no cuenta", () => {
  assert.equal(revisarSqlPegado([nueva], "Recuerda marcar [x] cuando esté.\n- [ ] SQL pegado en producción").casilla, null);
  assert.equal(revisarSqlPegado([nueva], "- [x] probado a 375 px\n\nSQL pegado en producción: todavía no").casilla, null);
});

test("editar o borrar una migración de la base sale rojo aunque la casilla esté marcada", () => {
  const editada = { filename: "supabase/migrations/20260928140000_clientas.sql", status: "modified" };
  const borrada = { filename: "supabase/migrations/20260928140000_clientas.sql", status: "removed" };
  assert.equal(revisarSqlPegado([editada], "- [x] SQL pegado en producción").motivos.length, 1);
  assert.equal(revisarSqlPegado([borrada], "").motivos.length, 1);
});

test("renombrar una migración sin tocar su contenido (choque de versiones) se permite; con cambios, no", () => {
  const renombrada = { filename: "supabase/migrations/20260928140001_a.sql", previous_filename: "supabase/migrations/20260928140000_a.sql", status: "renamed", changes: 0 };
  assert.deepEqual(revisarSqlPegado([renombrada], "").motivos, []);
  assert.equal(revisarSqlPegado([{ ...renombrada, changes: 3 }], "").editadas.length, 1);
});

// El parche que deja el renombre del 2026-09-30 (20260930050000 → 20260930050100) si se corrige el nombre de la línea 2 y se deja la nota
// «RENOMBRADA desde …» en la cabecera; el SQL no cambia.
const renombreConNota = {
  filename: "supabase/migrations/20260930050100_conteo_ajuste_previo_en_la_nota.sql",
  previous_filename: "supabase/migrations/20260930050000_conteo_ajuste_previo_en_la_nota.sql",
  status: "renamed",
  changes: 6,
  patch: [
    "@@ -1,7 +1,11 @@",
    " -- ============================================================================",
    "--- 20260930050000_conteo_ajuste_previo_en_la_nota.sql — CAYLA V2 · Inventario > Conteo",
    "+-- 20260930050100_conteo_ajuste_previo_en_la_nota.sql — CAYLA V2 · Inventario > Conteo",
    " -- «Al abrir: N» explica también lo que el PROPIO cierre ajustó (2026-09-30)",
    " -- UNA sola parte (un índice y una función reescrita; sin políticas ni `drop trigger`; idempotente).",
    "+-- RENOMBRADA el 2026-09-30 desde `20260930050000_conteo_ajuste_previo_en_la_nota.sql`: esa versión la tomó también",
    "+-- `20260930050000_terminales_pasan_la_puerta_de_lectura.sql` (PR #642, ya pegada en producción como `20260930143821`), y",
    "+-- dos archivos con la misma versión rompen `supabase start` desde cero (llave duplicada en `schema_migrations`). Esta aún",
    "+-- no estaba en producción, por eso se movió esta y no la otra. El SQL de abajo es el mismo: solo cambió el nombre.",
    " --",
    " -- EL PROBLEMA PRIMERO. Conteo 13: la camisa tenía 1, no se encontró, se contó 0 y el cierre descontó 1 (stock 0).",
    " -- encuentran, el líder pulsa «Editar conteo» y cuenta 1.",
  ].join("\n"),
};

test("renombrar tocando solo la cabecera de comentarios (la nota «RENOMBRADA desde …») se permite", () => {
  assert.deepEqual(revisarSqlPegado([renombreConNota], "").motivos, []);
  // Cabecera corta: lo que sigue al último cambio es contexto y puede ser SQL.
  const corta = "@@ -1,4 +1,5 @@\n--- 20260101000000_x.sql\n+-- 20260101000100_x.sql\n+-- RENOMBRADA desde 20260101000000.\n \n set search_path = retail, public, extensions;";
  assert.deepEqual(revisarSqlPegado([{ ...renombreConNota, patch: corta }], "").motivos, []);
});

test("renombrar con cualquier cambio fuera de la cabecera cuenta como edición", () => {
  const editada = (patch) => revisarSqlPegado([{ ...renombreConNota, patch }], "- [x] SQL pegado en producción").editadas.length;
  // SQL cambiado, aunque esté en el primer tramo.
  assert.equal(editada("@@ -1,3 +1,3 @@\n -- cabecera\n-set lock_timeout = '3s';\n+set lock_timeout = '5s';"), 1);
  // Un comentario agregado DEBAJO de una línea de SQL (podría estar dentro de un cuerpo $$ … $$ y cambiar la función).
  assert.equal(editada("@@ -1,3 +1,4 @@\n -- cabecera\n set search_path = retail, public, extensions;\n+-- nota nueva\n --"), 1);
  // Un comentario más abajo en el archivo: el tramo no empieza en la línea 1.
  assert.equal(editada("@@ -40,3 +40,4 @@\n begin\n+  -- aclaración\n   perform 1;"), 1);
  // Dos tramos: la cabecera y otro más abajo.
  assert.equal(editada(`${renombreConNota.patch}\n@@ -80,2 +84,3 @@\n begin\n+-- otra cosa\n end;`), 1);
  // Sin parche (la API lo omite si el cambio es muy grande): ante la duda, edición.
  assert.equal(editada(undefined), 1);
});

test("renombrar un archivo HACIA supabase/migrations es agregar una migración: pide la casilla", () => {
  const entra = { filename: "supabase/migrations/20260929100000_algo.sql", previous_filename: "docs/borradores/algo.sql", status: "renamed", changes: 0 };
  const r = revisarSqlPegado([entra], "");
  assert.deepEqual(r.nuevas, [entra.filename]);
  assert.equal(r.motivos.length, 1);
  assert.deepEqual(revisarSqlPegado([entra], "- [x] SQL pegado en producción").motivos, []);
});

test("sacar una migración de supabase/migrations es borrarla de main: sale rojo aunque no cambie el contenido", () => {
  const sale = { filename: "supabase/migraciones-viejas/20260914165703_x.sql", previous_filename: "supabase/migrations/20260914165703_x.sql", status: "renamed", changes: 0 };
  const r = revisarSqlPegado([sale], "- [x] SQL pegado en producción");
  assert.equal(r.editadas.length, 1);
  assert.equal(r.motivos.length, 1);
});

test("el script lee la respuesta de --slurp (páginas anidadas): sin casilla sale con 1, con la casilla con 0", () => {
  const paginas = [[web], [nueva]]; // la migración viene en la SEGUNDA página
  const sin = correr(paginas, "- [ ] **SQL pegado en producción.**");
  assert.equal(sin.codigo, 1, sin.salida);
  assert.match(sin.error, /20260929100000_algo\.sql/);
  assert.equal(correr(paginas, "- [x] **SQL pegado en producción.**").codigo, 0);
  assert.equal(correr([[web]], "").codigo, 0);
  const editada = correr([[{ filename: "supabase/migrations/20260928140000_clientas.sql", status: "modified" }]], "- [x] SQL pegado en producción");
  assert.equal(editada.codigo, 1, editada.salida);
});

test("lo que no es una migración de supabase/migrations no cuenta (seed, scripts, docs)", () => {
  const otros = [
    { filename: "supabase/seed.sql", status: "modified" },
    { filename: "docs/datos/consultas/frescura.sql", status: "added" },
    { filename: "supabase/migrations/README.md", status: "added" },
  ];
  assert.deepEqual(revisarSqlPegado(otros, "").motivos, []);
});

test("la plantilla del formulario tiene las dos casillas que este check busca, sin marcar", () => {
  const plantilla = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "pull_request_template.md"), "utf8");
  assert.match(plantilla, /^- \[ \] \*\*SQL pegado en producción\.\*\*/m);
  assert.match(plantilla, /^- \[ \] \*\*El SQL se pega después de fusionar\*\*/m);
  // Marcarlas debe bastar: si alguien cambia el texto de la plantilla, esta prueba lo avisa.
  assert.equal(revisarSqlPegado([nueva], plantilla.replace("- [ ] **SQL pegado", "- [x] **SQL pegado")).casilla, "pegado");
  assert.equal(revisarSqlPegado([nueva], plantilla.replace("- [ ] **El SQL se pega", "- [x] **El SQL se pega")).casilla, "despues");
  assert.equal(revisarSqlPegado([nueva], plantilla).casilla, null);
});
