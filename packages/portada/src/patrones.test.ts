import { describe, expect, it } from "vitest";
import { INTENSIDADES, PATRONES } from "./diseno";
import { INTENSIDAD, mascaraDePatron } from "./patrones";

describe("los estampados del fondo «Con dibujo»", () => {
  it("cada uno es un dibujo SVG que se repite, con su tamaño", () => {
    for (const p of PATRONES) {
      const url = mascaraDePatron(p);
      expect(url.startsWith('url("data:image/svg+xml,'), p).toBe(true);
      expect(url.endsWith('")'), p).toBe(true);
      const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
      expect(svg, p).toMatch(/^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' width='\d+' height='\d+' viewBox='0 0 \d+ \d+'>.+<\/svg>$/);
      // Una comilla doble cortaría el url("…") del estilo.
      expect(svg, p).not.toContain('"');
    }
  });

  it("no traen color: el color es el acento de la campaña, que cambia con el tema de la tienda", () => {
    for (const p of PATRONES) expect(decodeURIComponent(mascaraDePatron(p)), p).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl/i);
  });

  it("los ocho son distintos entre sí", () => {
    expect(new Set(PATRONES.map(mascaraDePatron)).size).toBe(PATRONES.length);
  });

  it("cada intensidad se ve más que la anterior, y ninguna tapa el nombre", () => {
    const v = INTENSIDADES.map((i) => INTENSIDAD[i]);
    expect(v).toEqual([...v].sort((a, b) => a - b));
    expect(new Set(v).size).toBe(v.length);
    expect(Math.max(...v)).toBeLessThan(0.5);
  });
});
