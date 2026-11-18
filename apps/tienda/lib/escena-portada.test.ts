import { describe, expect, it } from "vitest";
import { escalaDePrenda, ordenDeLaEscena, topeDeCategoria } from "./escena-portada";

describe("la escala de la prenda en la escena", () => {
  it("un pantalón largo no domina sobre un top", () => {
    const pantalon = escalaDePrenda("Pantalones", 0.45);
    const top = escalaDePrenda("Tops", 0.9);
    expect(pantalon).toBeLessThanOrEqual(0.76);
    expect(pantalon / top).toBeLessThan(1.25);
  });

  it("nunca pasa del tope de su categoría ni baja del mínimo", () => {
    for (const categoria of ["Pantalones", "Faldas", "Shorts", "Tops", "Vestidos", "Otra", null])
      for (const forma of [0.2, 0.5, 1, 1.5, 3]) {
        const e = escalaDePrenda(categoria, forma);
        expect(e).toBeLessThanOrEqual(topeDeCategoria(categoria));
        expect(e).toBeGreaterThanOrEqual(0.44);
      }
  });

  it("sin la forma de la foto usa el tope, sin caerse", () => {
    expect(escalaDePrenda("Tops", 0)).toBe(0.68);
    expect(escalaDePrenda("Tops", Number.NaN)).toBe(0.68);
  });
});

describe("el orden de la escena", () => {
  it("la más chica va al centro y no se pierde ninguna", () => {
    const g = [{ categoria: "Pantalones" }, { categoria: "Shorts" }, { categoria: "Tops" }];
    const o = ordenDeLaEscena(g);
    expect(o[1].categoria).toBe("Shorts");
    expect(o).toHaveLength(3);
    expect(new Set(o).size).toBe(3);
  });
});
