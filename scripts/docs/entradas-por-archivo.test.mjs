// Pruebas del candado «una entrada, un archivo» (ADR-0259). `node --test scripts/docs/entradas-por-archivo.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONGELADOS, entradasFueraDeLugar } from "./entradas-por-archivo.mjs";

const diffDe = (archivo, ...lineas) =>
  [`diff --git a/${archivo} b/${archivo}`, `--- a/${archivo}`, `+++ b/${archivo}`, "@@ -5,0 +6,3 @@", ...lineas].join("\n");

const TABLERO = "docs/milimetro/README.md";
const filaDeAuditoria = (fecha) =>
  `| ${fecha} | \`/inventario\` en el celular ▸ «Ajustar stock» y «Resumen» en ícono | \`claude/x\` | 0 | 0 graves. [Informe](auditorias/${fecha}-x.md) |`;

test("una entrada fechada después del corte, en la bitácora o el backlog, se rechaza", () => {
  const diff = [
    diffDe("docs/BITACORA.md", "+## 2026-09-29 (algo nuevo)", "+Qué hice: …"),
    diffDe("docs/BACKLOG.md", "+## 🏷️ Otra cosa (2026-10-02, ADR-0300) — solo web"),
  ].join("\n");
  assert.deepEqual(entradasFueraDeLugar(diff), [
    { archivo: "docs/BITACORA.md", linea: "## 2026-09-29 (algo nuevo)" },
    { archivo: "docs/BACKLOG.md", linea: "## 🏷️ Otra cosa (2026-10-02, ADR-0300) — solo web" },
  ]);
});

test("las entradas hasta el corte (PR que ya estaban abiertos) pasan", () => {
  assert.deepEqual(entradasFueraDeLugar(diffDe("docs/BITACORA.md", "+## 2026-09-28 (de un PR viejo)")), []);
});

test("tachar un pendiente, un subtítulo o un cubo sin fecha pasan", () => {
  const diff = diffDe("docs/BACKLOG.md", "+- [x] ya se probó (2026-09-30)", "+### 2026-09-30 detalle", "+## 🔨 Construir");
  assert.deepEqual(entradasFueraDeLugar(diff), []);
});

test("otros archivos no importan, aunque traigan encabezados fechados", () => {
  const diff = diffDe("docs/bitacora/2026-09-29-x.md", "+## 2026-09-29 (en su lugar)");
  assert.deepEqual(entradasFueraDeLugar(diff), []);
});

test("un diff vacío pasa", () => {
  assert.deepEqual(entradasFueraDeLugar(""), []);
});

// El tablero de auditorías de «Al milímetro» (ADR-0259, act. 2026-11-17): la fila ya no se escribe, el informe es el registro.

test("una fila de auditoría fechada después del corte se rechaza", () => {
  const fila = filaDeAuditoria("2026-11-18");
  assert.deepEqual(entradasFueraDeLugar(diffDe(TABLERO, `+${fila}`)), [{ archivo: TABLERO, linea: fila }]);
});

test("las filas hasta el corte (los PR abiertos el día que nació el candado) pasan", () => {
  assert.deepEqual(entradasFueraDeLugar(diffDe(TABLERO, `+${filaDeAuditoria("2026-11-17")}`)), []);
});

test("en el tablero, lo que no es una fila fechada pasa: un párrafo con fecha, un encabezado, la tabla de «Cuándo»", () => {
  const diff = diffDe(
    TABLERO,
    "+Desde el 2026-11-18 cada auditoría es su informe.",
    "+## Auditorías hasta el 2026-11-18",
    "+| Auditar lo que ya existe | `/milimetro auditar <ruta|módulo>` desde el 2026-11-18 |",
  );
  assert.deepEqual(entradasFueraDeLugar(diff), []);
});

test("una fila fechada en otro archivo no importa: el candado es del tablero", () => {
  const diff = diffDe("docs/milimetro/propuestas.md", `+${filaDeAuditoria("2026-11-18")}`);
  assert.deepEqual(entradasFueraDeLugar(diff), []);
});

test("cada archivo se mide con SU corte: una fila del tablero no se salva con el corte de la bitácora, ni al revés", () => {
  const diff = [diffDe("docs/BITACORA.md", "+## 2026-11-17 (entrada nueva)"), diffDe(TABLERO, `+${filaDeAuditoria("2026-11-17")}`)].join("\n");
  assert.deepEqual(entradasFueraDeLugar(diff), [{ archivo: "docs/BITACORA.md", linea: "## 2026-11-17 (entrada nueva)" }]);
});

test("todo archivo congelado dice qué hacer con una entrada nueva y a dónde va", () => {
  for (const { archivo, corte, destino } of CONGELADOS) {
    assert.match(corte, /^\d{4}-\d{2}-\d{2}$/, archivo);
    assert.match(destino, /AAAA-MM-DD-<tema>\.md/, archivo);
  }
});
