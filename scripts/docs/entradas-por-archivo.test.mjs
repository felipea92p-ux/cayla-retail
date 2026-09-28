// Pruebas del candado «una entrada, un archivo» (ADR-0259). `node --test scripts/docs/entradas-por-archivo.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entradasFueraDeLugar } from "./entradas-por-archivo.mjs";

const diffDe = (archivo, ...lineas) =>
  [`diff --git a/${archivo} b/${archivo}`, `--- a/${archivo}`, `+++ b/${archivo}`, "@@ -5,0 +6,3 @@", ...lineas].join("\n");

test("una entrada fechada después del corte, en la bitácora o el backlog, se rechaza", () => {
  const diff = [
    diffDe("docs/BITACORA.md", "+## 2026-09-29 (algo nuevo)", "+Qué hice: …"),
    diffDe("docs/BACKLOG.md", "+## 🏷️ Otra cosa (2026-10-02, ADR-0300) — solo web"),
  ].join("\n");
  assert.deepEqual(entradasFueraDeLugar(diff, "2026-09-28"), [
    { archivo: "docs/BITACORA.md", encabezado: "## 2026-09-29 (algo nuevo)" },
    { archivo: "docs/BACKLOG.md", encabezado: "## 🏷️ Otra cosa (2026-10-02, ADR-0300) — solo web" },
  ]);
});

test("las entradas hasta el corte (PR que ya estaban abiertos) pasan", () => {
  assert.deepEqual(entradasFueraDeLugar(diffDe("docs/BITACORA.md", "+## 2026-09-28 (de un PR viejo)"), "2026-09-28"), []);
});

test("tachar un pendiente, un subtítulo o un cubo sin fecha pasan", () => {
  const diff = diffDe("docs/BACKLOG.md", "+- [x] ya se probó (2026-09-30)", "+### 2026-09-30 detalle", "+## 🔨 Construir");
  assert.deepEqual(entradasFueraDeLugar(diff, "2026-09-28"), []);
});

test("otros archivos no importan, aunque traigan encabezados fechados", () => {
  const diff = diffDe("docs/bitacora/2026-09-29-x.md", "+## 2026-09-29 (en su lugar)");
  assert.deepEqual(entradasFueraDeLugar(diff, "2026-09-28"), []);
});

test("un diff vacío pasa", () => {
  assert.deepEqual(entradasFueraDeLugar(""), []);
});
