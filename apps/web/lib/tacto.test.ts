import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-0611, mejora 5: con el dedo, todo se toca en 44 px. La medida real corre en un navegador (`pnpm --filter web tacto:medir`); esto vigila lo que un
// cambio distraído rompería: que la regla exista, gane y no alcance a la computadora de la tienda.
const css = readFileSync("app/estilos/tacto.css", "utf8");
const globales = readFileSync("app/globals.css", "utf8");

describe("con el dedo, 44 px (ADR-0611, mejora 5)", () => {
  it("toda la regla vive dentro de `pointer: coarse`: con mouse nada cambia de tamaño", () => {
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(sinComentarios.startsWith("@media (pointer: coarse) {")).toBe(true);
    expect(sinComentarios.match(/@media/g)).toHaveLength(1);
    expect(sinComentarios.endsWith("}")).toBe(true);
  });

  it("va al final y sin capa, para ganarle a un `h-9` y a las recetas de vidrio", () => {
    const imports = globales.split("\n").filter((l) => l.startsWith("@import"));
    expect(imports.at(-1)).toContain('"./estilos/tacto.css"');
    expect(imports.at(-1)).not.toContain("layer(");
  });

  it("las piezas del sistema están cubiertas", () => {
    for (const pieza of [".btn-cayla", ".caja-campo", ".fin-control", ".buscador", ".combo-pastilla", ".marco-fila", ".btn-enlace", ".interruptor", ".area-dedo"]) expect(css, pieza).toContain(pieza);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("max(100%, 44px)");
  });

  it("un botón sólido no usa el `::after`: es la luz de `.mov-boton`", () => {
    const area = css.slice(css.indexOf("position: relative"));
    expect(area).not.toContain(".btn-cayla");
  });
});
