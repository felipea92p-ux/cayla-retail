import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-0611, mejora 7: quien pidió menos transparencia o más contraste en su aparato ve el vidrio macizo. Una receta nueva con fondo translúcido se agrega al bloque.
const css = readFileSync("app/estilos/vidrio/recetas.css", "utf8");
const raiz = css.slice(css.indexOf(":root {"), css.indexOf("@media screen {"));
const inicio = css.indexOf("@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {");
const bloque = css.slice(inicio);
const todoLoMacizo = bloque + [...css.matchAll(/@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}\n/g)].map((m) => m[0]).join("");

const fondosTranslucidos = [...raiz.matchAll(/^\s*(--[a-z0-9-]+-fondo(?:-encima)?):\s*([^;]+);/gm)].filter((m) => m[2].includes("transparent")).map((m) => m[1]);

describe("el vidrio que aguanta (ADR-0611, mejora 7)", () => {
  it("el bloque existe y responde a las dos preferencias del aparato", () => {
    expect(inicio).toBeGreaterThan(0);
    expect(css).toContain("@media (prefers-contrast: more) {");
  });

  it("no queda nada desenfocado", () => {
    expect(bloque).toContain("backdrop-filter: none !important");
  });

  it("toda receta con fondo translúcido tiene su versión maciza", () => {
    expect(fondosTranslucidos.length).toBeGreaterThan(10);
    const faltan = fondosTranslucidos.filter((n) => !todoLoMacizo.includes(`${n}:`));
    expect(faltan, `Agrégalas al bloque «El vidrio que aguanta»: ${faltan.join(", ")}`).toEqual([]);
  });

  it("con más contraste también valen las recetas macizas de transparencia, no solo las nuevas", () => {
    const soloContraste = bloque.slice(0, bloque.indexOf("@media (prefers-contrast: more) {"));
    for (const n of ["--vidrio-hoja-fondo", "--placa-fondo", "--serena-fondo", "--vidrio-flota-fondo"]) expect(soloContraste, n).toContain(`${n}:`);
  });
});
