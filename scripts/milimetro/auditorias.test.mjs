// Pruebas del tablero de auditorías armado desde la carpeta (ADR-0259, act. 2026-11-17).
// `node --test scripts/milimetro/auditorias.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CORTE, leerInforme, problemasDelInforme, tablero } from "./auditorias.mjs";

const PLANTILLA = [
  "# Auditoría al milímetro — `/inventario` en el celular · 2026-11-18 · `claude/existencias` (`1d9a0ebb1`)",
  "Medido: 1440×900 claro vivo · 375×812 claro · 1440 oscuro · quieto     Servidor: localhost:3010",
  "Resumen: 0 graves · 1 media · 2 leves · 0 decididos a propósito",
  "",
  "## Graves",
].join("\n");

test("de un informe con la plantilla salen la fecha, la pieza y el resumen", () => {
  assert.deepEqual(leerInforme("2026-11-18-existencias-celular.md", PLANTILLA), {
    archivo: "docs/milimetro/auditorias/2026-11-18-existencias-celular.md",
    fecha: "2026-11-18",
    pieza: "`/inventario` en el celular",
    resumen: "0 graves · 1 media · 2 leves · 0 decididos a propósito",
  });
});

test("los informes de antes del acuerdo también se leen: otro título, el resumen en negrita o en un encabezado", () => {
  const casos = [
    ["# Al milímetro · auditar `/rotulos` (modo «Marcas») — 2026-11-13\n\n**Resumen:** 0 graves · 0 medias · 2 leves.", "`/rotulos` (modo «Marcas»)", "0 graves · 0 medias · 2 leves."],
    ["# Auditoría al milímetro · «Corregir color» (2026-11-13)\n\n**Resultado en lo que cambió: 0 graves, 0 medias, 0 leves.**", "«Corregir color»", "0 graves, 0 medias, 0 leves."],
    ["# Al milímetro · Cerrar un envío en Recibir\n\n## Resultado: 0 graves · 0 medias · 2 leves", "Cerrar un envío en Recibir", "0 graves · 0 medias · 2 leves"],
    ["# Al milímetro · «Poner un %» (PR #1898, ADR-0669)\n\n**0 graves · 0 medias · 0 leves** en lo nuevo.", "«Poner un %» (PR #1898, ADR-0669)", "0 graves · 0 medias · 0 leves en lo nuevo."],
  ];
  for (const [texto, pieza, resumen] of casos) {
    const informe = leerInforme("2026-11-13-x.md", texto);
    assert.equal(informe.pieza, pieza);
    assert.equal(informe.resumen, resumen);
  }
});

test("un informe viejo sin ninguna línea que cuente graves dice «sin resumen», no se cae", () => {
  assert.equal(leerInforme("2026-11-13-x.md", "# Al milímetro · Recibir ▸ paso Precio (textos)\n\nSolo textos.").resumen, "sin resumen");
});

test("el título no se toma por resumen aunque nombre los graves", () => {
  const informe = leerInforme("2026-11-16-x.md", "# Auditoría al milímetro — los 3 graves heredados · 2026-11-16\n\nResumen: 3 graves · 0 medias");
  assert.equal(informe.pieza, "los 3 graves heredados");
  assert.equal(informe.resumen, "3 graves · 0 medias");
});

test("un resumen largo se recorta para que la fila se lea", () => {
  const largo = `Resumen: 0 graves · ${"muchas notas del resto de la página ".repeat(10)}`;
  const { resumen } = leerInforme("2026-11-18-x.md", `# Auditoría al milímetro — x\n${largo}`);
  assert.ok(resumen.length <= 150 && resumen.endsWith("…"), resumen);
});

test("el tablero va de la más nueva a la más vieja y no rompe la tabla con una barra del texto", () => {
  const informes = [
    leerInforme("2026-11-12-compras.md", "# Auditoría al milímetro — `/compras`\nResumen: 0 graves"),
    leerInforme("2026-11-18-existencias-celular.md", PLANTILLA),
    leerInforme("2026-11-14-auditar.md", "# Auditoría al milímetro — `/milimetro auditar <ruta|módulo>`\nResumen: 0 graves"),
  ];
  const lineas = tablero(informes).split("\n");
  assert.equal(lineas[0], "| Fecha | Ruta o pieza | Resumen | Informe |");
  assert.deepEqual(lineas.slice(2).map((l) => l.slice(2, 12)), ["2026-11-18", "2026-11-14", "2026-11-12"]);
  assert.match(lineas[3], /<ruta\\\|módulo>/);
});

// El contrato del informe nuevo: ya no hay una fila que lo resuma, así que tiene que alcanzar solo.

test("un informe posterior al corte sin su línea Resumen, o sin título, no pasa", () => {
  assert.deepEqual(problemasDelInforme("2026-11-18-x.md", PLANTILLA), []);
  assert.equal(problemasDelInforme("2026-11-18-x.md", "# Auditoría al milímetro — x\n\n**0 graves · 0 medias**").length, 1);
  assert.equal(problemasDelInforme("2026-11-18-x.md", "Medido: 1440\nResumen: 0 graves").length, 1);
  assert.equal(problemasDelInforme("2026-11-18-x.md", "sin nada").length, 2);
});

test("la línea Resumen vale también en negrita o con su alcance («Resumen de lo que trajo el PR:»)", () => {
  for (const linea of ["**Resumen:** 0 graves", "**Resumen: 0 graves**", "Resumen de lo que trajo el PR: 0 graves"]) {
    assert.deepEqual(problemasDelInforme("2026-11-18-x.md", `# Auditoría al milímetro — x\n${linea}`), [], linea);
  }
});

test("los informes hasta el corte son historia: no se les exige nada", () => {
  assert.deepEqual(problemasDelInforme(`${CORTE}-x.md`, "sin título ni resumen"), []);
  assert.deepEqual(problemasDelInforme("2026-11-12-compras.md", "**0 graves**"), []);
});

test("un nombre que no es AAAA-MM-DD-<tema>.md no pasa, ni antes ni después del corte", () => {
  for (const nombre of ["existencias.md", "2026-11-18_existencias.md", "2026-11-18-Existencias.md", "18-11-2026-x.md"]) {
    assert.equal(problemasDelInforme(nombre, PLANTILLA).length, 1, nombre);
  }
});

test("el corte del informe es el mismo día en que el README dejó de recibir filas", () => {
  assert.equal(CORTE, "2026-11-17");
});
