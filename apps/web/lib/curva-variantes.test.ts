import { describe, it, expect } from "vitest";
import { detectarHuecosCurva, detectarCurvasIncompletas, type VarianteParaCurva } from "./curva-variantes";

const v = (talla: string | null, stock: number): VarianteParaCurva => ({ varianteId: `${talla}-${stock}`, talla, stock });

describe("detectarHuecosCurva — cuándo una prenda queda invendible por talla", () => {
  it("hueco real: hay stock antes y después de la talla en cero", () => {
    const huecos = detectarHuecosCurva([v("S", 3), v("M", 0), v("L", 5)]);
    expect(huecos).toEqual([{ tallaFaltante: "M", tallasConStock: ["S", "L"] }]);
  });

  it("agotarse en la punta no es un hueco (XL es la última talla)", () => {
    const huecos = detectarHuecosCurva([v("S", 3), v("M", 5), v("L", 0)]);
    expect(huecos).toEqual([]);
  });

  it("agotarse en el inicio tampoco es un hueco (S es la primera)", () => {
    const huecos = detectarHuecosCurva([v("S", 0), v("M", 5), v("L", 3)]);
    expect(huecos).toEqual([]);
  });

  it("sin stock en ninguna talla: no hay nada que redistribuir, no es un hueco", () => {
    expect(detectarHuecosCurva([v("S", 0), v("M", 0), v("L", 0)])).toEqual([]);
  });

  it("toda la curva con stock: normal", () => {
    expect(detectarHuecosCurva([v("S", 1), v("M", 1), v("L", 1)])).toEqual([]);
  });

  it("dos huecos en la misma curva se reportan los dos", () => {
    const huecos = detectarHuecosCurva([v("XS", 2), v("S", 0), v("M", 4), v("L", 0), v("XL", 1)]);
    expect(huecos.map((h) => h.tallaFaltante)).toEqual(["S", "L"]);
  });

  it("respeta el orden canónico de tallas, no el orden de llegada del arreglo", () => {
    const huecos = detectarHuecosCurva([v("L", 5), v("M", 0), v("S", 3)]);
    expect(huecos).toEqual([{ tallaFaltante: "M", tallasConStock: ["S", "L"] }]);
  });

  it("menos de 3 tallas con talla asignada: nunca hay hueco posible", () => {
    expect(detectarHuecosCurva([v("S", 3), v("M", 0)])).toEqual([]);
  });

  it("variantes sin talla asignada no entran en la curva", () => {
    const huecos = detectarHuecosCurva([v("S", 3), v(null, 0), v("M", 0), v("L", 5)]);
    expect(huecos).toEqual([{ tallaFaltante: "M", tallasConStock: ["S", "L"] }]);
  });
});

describe("detectarCurvasIncompletas — agrupado por producto+color+sede", () => {
  it("solo reporta huecos del grupo que de verdad tiene un hueco", () => {
    const resultado = detectarCurvasIncompletas([
      {
        productoId: "p1",
        referencia: "Blusa Camila",
        color: "Blanco",
        colorHex: "#fff",
        sedeId: "s1",
        sedeNombre: "Trujillo",
        variantes: [v("S", 3), v("M", 0), v("L", 5)],
      },
      {
        productoId: "p1",
        referencia: "Blusa Camila",
        color: "Negro",
        colorHex: "#000",
        sedeId: "s1",
        sedeNombre: "Trujillo",
        variantes: [v("S", 1), v("M", 2), v("L", 3)],
      },
    ]);
    expect(resultado).toEqual([
      {
        productoId: "p1",
        referencia: "Blusa Camila",
        color: "Blanco",
        colorHex: "#fff",
        sedeId: "s1",
        sedeNombre: "Trujillo",
        tallaFaltante: "M",
        tallasConStock: ["S", "L"],
      },
    ]);
  });
});
