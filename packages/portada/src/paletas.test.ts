import { describe, expect, it } from "vitest";
import { CONTRASTE_MINIMO, contraste, mezclar } from "./contraste";
import { PALETAS, PALETA_DE_SIEMPRE, coloresEnTema, paletaPorId, variablesDePaleta } from "./paletas";

describe("las paletas de la portada", () => {
  it("cada una tiene un id distinto y un nombre", () => {
    expect(new Set(PALETAS.map((p) => p.id)).size).toBe(PALETAS.length);
    for (const p of PALETAS) expect(p.nombre.trim()).not.toBe("");
  });

  // La ceja (10,5 px) y la descripción (15 px) son texto chico y van sobre el fondo; el nombre puede llegar hasta la esquina del
  // segundo tono. En los dos temas: una paleta que se lee de día y no de noche no se ofrece.
  for (const p of PALETAS) {
    for (const tema of ["claro", "oscuro"] as const) {
      it(`${p.nombre} se lee en ${tema}`, () => {
        const c = coloresEnTema(p, tema);
        expect(contraste(c.letra, c.fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        expect(contraste(c.letra, c.fondo2)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        expect(contraste(c.acento, c.fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        // La descripción va con la letra al 86 % (heroe.css, `.t-hero-desc`).
        expect(contraste(mezclar(c.fondo, c.letra, 0.86), c.fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      });
    }
  }

  it("de noche, una paleta clara pasa a su versión oscura y una oscura solo baja su fondo", () => {
    const arena = paletaPorId("arena");
    expect(coloresEnTema(arena, "oscuro").fondo).toBe("#2a2622");
    const bosque = paletaPorId("bosque");
    expect(coloresEnTema(bosque, "oscuro")).toEqual({ ...coloresEnTema(bosque, "claro"), fondo: mezclar("#1f3a2b", "#000000", 0.3), fondo2: mezclar("#2f5640", "#000000", 0.3) });
  });

  it("un id que no existe cae en la de siempre, nunca en un hueco", () => {
    expect(paletaPorId("no-existe")).toBe(PALETA_DE_SIEMPRE);
    expect(paletaPorId(null)).toBe(PALETA_DE_SIEMPRE);
    expect(PALETA_DE_SIEMPRE.id).toBe("cayla");
  });

  it("las variables son las `--t-hero*` del héroe, con el vidrio y el filo hechos de la letra", () => {
    expect(variablesDePaleta(coloresEnTema(PALETA_DE_SIEMPRE, "claro"))).toEqual({
      "--t-hero": "#6a2118",
      "--t-hero-2": "#92301f",
      "--t-hero-tinta": "#f6efe6",
      "--t-hero-acento": "#f4c3b3",
      "--t-hero-vidrio": "rgba(246, 239, 230, .10)",
      "--t-hero-filo": "rgba(246, 239, 230, .22)",
      "--t-hero-colibri": "brightness(0) invert(1)",
      "--t-hero-boton-letra": "#1a1a18",
    });
  });
});
