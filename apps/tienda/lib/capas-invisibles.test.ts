import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Una capa invisible (`::before` con `position: absolute`) que agranda el blanco de toque de un enlace se ancla al ancestro posicionado más cercano. Si su
// enlace no está posicionado, se ancla a la página entera y tapa la primera pantalla: en producción el botón «Ver lo nuevo» del desfile no recibía el toque
// porque las píldoras de «Las ofertas» (más abajo en el Inicio) dibujaban una capa así (2026-10-27). La prueba exige que cada enlace con su capa sea `position: relative`.

const leer = (archivo: string) => readFileSync(join(__dirname, "..", "app", "estilos", archivo), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Todas las declaraciones de las reglas cuyo selector es exactamente `selector`, juntas. */
function declaraciones(css: string, selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(",").some((s) => s.trim() === selector))
    .map((m) => m[2])
    .join(";");
}

describe("las capas invisibles de los blancos de toque", () => {
  it("las píldoras de «Las ofertas» están ancladas a sí mismas", () => {
    expect(declaraciones(leer("inicio.css"), ".t-ofertas .t-pildora::before")).toMatch(/position:\s*absolute/);
    expect(declaraciones(leer("inicio.css"), ".t-ofertas .t-pildora")).toMatch(/position:\s*relative/);
  });
});
