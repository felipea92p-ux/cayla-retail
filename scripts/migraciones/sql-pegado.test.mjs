// Pruebas del check «SQL pegado». Sin dependencias: `node --test scripts/migraciones/sql-pegado.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { revisarSqlPegado } from "./sql-pegado.mjs";

const nueva = { filename: "supabase/migrations/20260929100000_algo.sql", status: "added" };
const web = { filename: "apps/web/lib/algo.ts", status: "modified" };

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
