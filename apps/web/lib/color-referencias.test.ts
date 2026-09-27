import { describe, expect, it } from "vitest";
import { MAX_SINONIMOS, normalizarPantone, normalizarSinonimos } from "./color-referencias";

describe("normalizarPantone", () => {
  it("deja el código como lo guarda la base, lo escriban como lo escriban", () => {
    expect(normalizarPantone("19-1557 TCX")).toBe("19-1557 TCX");
    expect(normalizarPantone("19-1557")).toBe("19-1557 TCX");
    expect(normalizarPantone(" 19 1557 tcx ")).toBe("19-1557 TCX");
    expect(normalizarPantone("191557")).toBe("19-1557 TCX");
  });

  it("vacío es «sin código», y lo que no tiene la forma se rechaza", () => {
    expect(normalizarPantone("")).toBeNull();
    expect(normalizarPantone(null)).toBeNull();
    expect(normalizarPantone("Chili Pepper")).toBe("invalido");
    expect(normalizarPantone("19-155")).toBe("invalido");
    expect(normalizarPantone("19-1557 TPG")).toBe("invalido");
  });
});

describe("normalizarSinonimos", () => {
  it("parte por comas, punto y coma o renglones, y limpia espacios", () => {
    expect(normalizarSinonimos("guinda,  burdeos ; borgoña\ngranate")).toEqual(["guinda", "burdeos", "borgoña", "granate"]);
  });

  it("sin vacíos ni repetidos, aunque cambien tildes o mayúsculas", () => {
    expect(normalizarSinonimos(["Café", "cafe", " ", "CAFÉ", "moka"])).toEqual(["Café", "moka"]);
  });

  it("nunca repite el propio nombre del color", () => {
    expect(normalizarSinonimos(["gris", "plomo"], "Gris")).toEqual(["plomo"]);
  });

  it("tiene un tope", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `sinónimo ${i}`);
    expect(normalizarSinonimos(muchos)).toHaveLength(MAX_SINONIMOS);
  });
});
