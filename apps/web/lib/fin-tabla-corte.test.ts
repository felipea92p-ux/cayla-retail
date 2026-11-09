import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tarea 119: `.fin-tabla` pedía 900 px y solo pasaba a fichas mirando la VENTANA, así que entre 861 y 1273 px, con el lateral abierto, «Dejó» y «En caja» quedaban
// fuera de su tarjeta. La tabla mira ahora el ancho de su tarjeta. Las que viven en una columna (flujo, utilidad, hoja) o traen su propio ancho siguen como estaban.
const css = readFileSync(join(__dirname, "..", "app/estilos/finanzas.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function bloque(titulo: string): string {
  const inicio = css.indexOf(titulo);
  expect(inicio, `no existe «${titulo}»`).toBeGreaterThanOrEqual(0);
  let j = css.indexOf("{", inicio) + 1;
  const abre = j;
  for (let hondo = 1; hondo > 0; j++) {
    if (css[j] === "{") hondo++;
    if (css[j] === "}") hondo--;
  }
  return css.slice(abre, j - 1);
}

describe("la tabla de Finanzas mira su tarjeta", () => {
  it("ya no pide 900 px", () => {
    expect(css).not.toMatch(/min-width:\s*900px/);
  });

  it("su envoltorio es el contenedor, salvo las tablas que viven en una columna o traen su ancho", () => {
    const selector = css.match(/\.fin-tabla-wrap:has\([^{]+\{[^}]*\}/)?.[0] ?? "";
    expect(selector).toContain("container: fin-tabla / inline-size");
    for (const fuera of [".fin-tabla-flujo", ".fin-tabla-utilidad", ".fin-tabla-hoja", "[style]"]) expect(selector).toContain(fuera);
  });

  it("bajo 760 px de tarjeta pasa a fichas con su rótulo", () => {
    const fichas = bloque("@container fin-tabla (max-width: 759.98px)");
    expect(fichas).toMatch(/\.fin-tabla thead\s*\{\s*display: none/);
    expect(fichas).toContain("attr(data-l)");
    expect(fichas).toMatch(/\.fin-tabla td\.fin-num\s*\{\s*text-align: left/);
  });

  it("las rejillas de la pantalla siguen mirando la ventana", () => {
    expect(bloque("@container fin-tabla (max-width: 759.98px)")).not.toContain(".fin-dos-col");
    expect(bloque("@media (max-width: 860px)")).toContain(".fin-dos-col");
  });

  // Tarea 119 midió 739 px de mínimo con seis columnas; la columna «IGV» suma 91 px (28 de relleno y la cifra, medido con DM Sans a 14 px).
  it("«Cada sede, junta» con IGV lleva siete columnas: pasa a fichas antes de salirse de su tarjeta", () => {
    const fuente = readFileSync(join(__dirname, "..", "components/finanzas/SedesJuntas.tsx"), "utf8");
    const conIgv = fuente.match(/COLUMNAS_CON_IGV = \[([^\]]+)\]/)?.[1] ?? "";
    expect(conIgv.split(",").length + 1, "si cambian las columnas, vuelve a medir el mínimo").toBe(7);
    expect(fuente).toContain('conIgv ? "sedes-juntas-con-igv"');
    const corte = Number(css.match(/@container fin-tabla \(max-width: (\d+)\.98px\)\s*\{\s*\.sedes-juntas-con-igv/)?.[1]);
    expect(corte).toBeGreaterThanOrEqual(739 + 91);
    const fichas = bloque(`@container fin-tabla (max-width: ${corte}.98px)`);
    expect(fichas).toMatch(/\.sedes-juntas-con-igv \.fin-tabla thead\s*\{\s*display: none/);
    expect(fichas).toContain("attr(data-l)");
    expect(fichas).toMatch(/\.sedes-juntas-con-igv \.fin-tabla td\.fin-num\s*\{\s*text-align: left/);
  });
});
