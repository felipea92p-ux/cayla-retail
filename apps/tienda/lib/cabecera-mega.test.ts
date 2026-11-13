import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El panel de «Ropa» y «Accesorios» (`.t-mega`) se ancla al ancestro posicionado más cercano. Debe ser la fila de la cabecera (todo el ancho): el 2026-10-27 un
// `.t-nav { position: relative }`, puesto para colocar la raya que viaja (ADR-0524, act. 8), lo encogió al ancho de las pestañas y los nombres de las categorías
// salían cortados con «…». Ni la prueba de desborde ni el barrido de anchos lo vieron porque el panel solo existe con el mouse encima: lo vigila esta prueba.

const CSS = readFileSync(join(__dirname, "..", "app", "estilos", "cabecera.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const GLOBALES = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Todas las declaraciones de las reglas cuyo selector es exactamente `selector`. */
function declaraciones(css: string, selector: string): string {
  const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(",").some((s) => s.trim() === selector));
  return reglas.map((m) => m[2]).join(";");
}

describe("el menú desplegable de la cabecera ocupa todo el ancho", () => {
  it("el nav no está posicionado (si lo estuviera, el panel se encogería al ancho de las pestañas)", () => {
    expect(declaraciones(CSS, ".t-nav")).not.toMatch(/position\s*:\s*(relative|absolute|fixed|sticky)/);
  });

  it("el panel se ancla de lado a lado a la fila de la cabecera, que sí está posicionada", () => {
    const panel = declaraciones(CSS, ".t-mega");
    expect(panel).toMatch(/position\s*:\s*absolute/);
    expect(panel).toMatch(/left\s*:\s*0/);
    expect(panel).toMatch(/right\s*:\s*0/);
    expect(declaraciones(GLOBALES, ".t-cab-fila")).toMatch(/position\s*:\s*relative/);
  });

  it("el envoltorio de cada menú tampoco está posicionado", () => {
    expect(declaraciones(CSS, ".t-mega-envol")).not.toMatch(/position\s*:/);
  });
});
