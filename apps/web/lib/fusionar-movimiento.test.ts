import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para «Fusionar productos repetidos» (excepción del 2026-11-13, rediseño de ADR-0650): Felipe eligió
// «movimiento rico, una vez, sin rebote ni bucle». Las columnas que se enfocan, la gota y su ✓ que se dibuja, el dato que se voltea,
// las celdas de la matriz en cascada y el sello que se estampa: cada uno una vez, con los tiempos con nombre y la curva del sistema,
// apagado con «reducir movimiento» (y con «Animaciones» apagado, que lo hace `movimiento.css` para todo el ERP).

const crudo = readFileSync(join(__dirname, "../app/estilos/vidrio/fusionar.css"), "utf8");
const css = crudo.replace(/\/\*[\s\S]*?\*\//g, "");
const REDUCIR = "@media (prefers-reduced-motion: reduce)";
const antes = css.slice(0, css.indexOf(REDUCIR));
const reducido = css.slice(css.indexOf(REDUCIR));

describe("fusionar.css — los límites del movimiento (ADR-0136, excepción «Fusionar productos repetidos»)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(css).not.toMatch(/\binfinite\b/);
    expect(css).not.toMatch(/animation-iteration-count/);
  });

  it("toda animación y transición usa la curva del sistema y un tiempo con nombre (ni curva ni duración propia)", () => {
    expect(css).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
    const animaciones = antes.match(/(?:^|[\s;{])animation\s*:[^;}]+/g) ?? [];
    expect(animaciones.length).toBeGreaterThanOrEqual(10);
    for (const a of animaciones) {
      expect(a, `«${a.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
      expect(a, `«${a.trim()}» no usa un tiempo con nombre`).toMatch(/var\(--t-(resp|cambio|hoja|momento)\)/);
    }
    for (const t of antes.match(/(?:^|[\s;{])transition\s*:[^;}]+/g) ?? []) expect(t, `«${t.trim()}»`).toMatch(/var\(--t-(resp|cambio|hoja|momento)\) var\(--ease-cayla\)/);
  });

  it("ningún fotograma intermedio: cada entrada va de un estado al reposo, sin ida y vuelta (rebote)", () => {
    for (const k of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      expect(k[2], `@keyframes ${k[1]} tiene un paso intermedio`).not.toMatch(/\d+%/);
      expect(k[2], `@keyframes ${k[1]} pasa de escala 1 al bajar`).not.toMatch(/scale\(0\.9[5-9]\)/);
    }
  });

  it("la cascada tiene tope: las celdas de la matriz cuentan hasta 12 y las filas hasta 7 (lo pone el componente)", () => {
    const piezas = readFileSync(join(__dirname, "../components/fusionar-productos/piezas.tsx"), "utf8");
    const hoja = readFileSync(join(__dirname, "../components/fusionar-productos/FusionarProductosHoja.tsx"), "utf8");
    expect(piezas).toMatch(/Math\.min\(k\+\+, 12\)/);
    expect(hoja).toMatch(/Math\.min\(k, 7\)/);
  });

  it("todo se apaga con «reducir movimiento»", () => {
    expect(reducido).toMatch(/animation:\s*none\s*!important/);
    expect(reducido).toMatch(/transition:\s*none\s*!important/);
    for (const clase of ["fus-visto", "fus-columna-caja", "fus-fila", "fus-final", "fus-voltea", "fus-sello", "fus-comparar"])
      expect(reducido, `«${clase}» sigue animada con reducir movimiento`).toContain(`.${clase}`);
  });

  it("un :hover vive dentro de @media (hover: hover), y lo que se desplaza no se desenfoca (ADR-0623)", () => {
    const fuera = css.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}/g, "");
    expect(fuera).not.toMatch(/:hover/);
    expect(css).not.toMatch(/backdrop-filter/);
  });

  it("solo colores del tema: ni un hex suelto ni rgb()", () => {
    expect(crudo).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
