import { describe, expect, it } from "vitest";
import { conAlfa, contraste, hexRgb, luminancia, mezclar } from "./contraste";

describe("la aritmética del color", () => {
  it("lee un color de seis o de tres cifras, y rechaza lo que no es un color", () => {
    expect(hexRgb("#6a2118")).toEqual([106, 33, 24]);
    expect(hexRgb("#fff")).toEqual([255, 255, 255]);
    expect(() => hexRgb("rojo")).toThrow("Color inválido");
  });

  it("mezcla: 0 deja el primero, 1 llega al segundo, 0,5 queda a la mitad", () => {
    expect(mezclar("#6a2118", "#000000", 0)).toBe("#6a2118");
    expect(mezclar("#6a2118", "#000000", 1)).toBe("#000000");
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("mide el contraste como WCAG: negro sobre blanco es 21, un color sobre sí mismo es 1, y el orden no importa", () => {
    expect(luminancia("#000000")).toBe(0);
    expect(luminancia("#ffffff")).toBe(1);
    expect(contraste("#000000", "#ffffff")).toBe(21);
    expect(contraste("#6a2118", "#6a2118")).toBe(1);
    expect(contraste("#f6efe6", "#6a2118")).toBe(contraste("#6a2118", "#f6efe6"));
  });

  it("escribe la transparencia como la tienda en sus tokens", () => {
    expect(conAlfa("#f6efe6", 0.1)).toBe("rgba(246, 239, 230, .10)");
    expect(conAlfa("#f6efe6", 0.22)).toBe("rgba(246, 239, 230, .22)");
  });
});
