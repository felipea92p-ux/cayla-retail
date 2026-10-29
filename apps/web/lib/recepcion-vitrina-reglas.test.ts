import { describe, expect, it } from "vitest";
import { caraDeVitrina } from "./recepcion-vitrina-reglas";
import type { Combinacion } from "./recepcion-combinaciones-reglas";

const comb = (varianteId: string, precioSede: number | null, costoHeredado: number | null): Combinacion => ({
  varianteId,
  color: "Rosado",
  talla: varianteId.toUpperCase(),
  cantidad: 1,
  precioGeneral: precioSede,
  precioSede,
  costoHeredado,
});

describe("caraDeVitrina", () => {
  it("con todas iguales da un solo precio, un costo y lo que se gana", () => {
    const c = caraDeVitrina([comb("s", 64.9, 26), comb("m", 64.9, 26)], {}, {});
    expect(c).toMatchObject({ precio: 64.9, costo: 26, pierde: false, valeEn: null });
    expect(c.ganaTexto).toBe("S/ 38.90");
  });

  it("si varían, no inventa un precio: da el rango", () => {
    const c = caraDeVitrina([comb("s", 59.9, 26), comb("m", 64.9, 26)], {}, {});
    expect(c.precio).toBeNull();
    expect(c.precioTexto).toBe("S/ 59.90 – 64.90");
    expect(c.ganaTexto).toBe("S/ 33.90 – 38.90");
  });

  it("lo escrito manda sobre lo de hoy, y dice dónde vale", () => {
    const todas = caraDeVitrina([comb("s", 64.9, 26), comb("m", 64.9, 26)], { s: 30, m: 30 }, { s: { valor: 69.9, valeEn: "todas" }, m: { valor: 69.9, valeEn: "todas" } });
    expect(todas).toMatchObject({ precio: 69.9, costo: 30, valeEn: "todas" });
    const mezcla = caraDeVitrina([comb("s", 64.9, 26), comb("m", 64.9, 26)], {}, { s: { valor: 69.9, valeEn: "todas" }, m: { valor: 69.9, valeEn: "sede" } });
    expect(mezcla.valeEn).toBe("sede");
  });

  it("avisa cuando se vendería por debajo del costo", () => {
    expect(caraDeVitrina([comb("s", 20, 26)], {}, {}).pierde).toBe(true);
  });

  it("sin precio o sin costo leídos no calcula lo que se gana", () => {
    const c = caraDeVitrina([comb("s", null, 26)], {}, {});
    expect(c).toMatchObject({ precio: null, precioTexto: null, ganaTexto: null, pierde: false });
    expect(caraDeVitrina([], {}, {})).toMatchObject({ precio: null, costo: null, ganaTexto: null });
  });
});
