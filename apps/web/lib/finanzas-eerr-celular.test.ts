import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Tarea 122: en el teléfono el cuadro por sede se desliza de lado y el nombre del concepto tiene que quedarse. Los fondos de la tabla son translúcidos: una celda fija con
// ellos dejaría ver los números que pasan por detrás. Y lo que se desplaza no se desenfoca (ADR-0623). Se mira a 375 px en el navegador; esto vigila lo que no debe volver.
const css = readFileSync(new URL("../app/estilos/finanzas.css", import.meta.url), "utf8");
const bloque = css.slice(css.indexOf("/* El cuadro por sede se desliza"), css.indexOf("/* Fin del cuadro por sede en pantallas chicas */"));

describe("la primera columna del cuadro por sede", () => {
  it("se queda fija al deslizar", () => {
    expect(bloque).toMatch(/position:\s*sticky/);
    expect(bloque).toMatch(/left:\s*0/);
  });
  it("tiene un fondo opaco por cada tipo de fila, de los tokens", () => {
    expect(bloque).toContain("tr.fin-eerr-sub td:first-child");
    expect(bloque).toContain("th:first-child");
    expect(bloque).toContain("var(--color-papel)");
    expect(bloque).not.toContain("transparent");
  });
  it("no desenfoca", () => expect(bloque).not.toContain("backdrop-filter"));
  it("bajo 640 px el ancho lo dan sus columnas, no los 860 px", () => {
    expect(bloque).toMatch(/@media \(max-width: 639px\)[\s\S]*min-width:\s*100%/);
  });
});
