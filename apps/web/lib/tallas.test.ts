import { describe, it, expect } from "vitest";
import { compararTallas, tipoDeTalla } from "./tallas";

// Las 25 tallas reales del vocabulario cerrado de producción (2026-09-18).
// Si una cae en "otras", la pantalla de Tallas la manda a un grupo que no le
// corresponde y se pierde justo el orden que se quería dar al mirarlas.
describe("tipoDeTalla — el vocabulario que ya existe", () => {
  it.each([
    ["XS", "letras"],
    ["S", "letras"],
    ["M", "letras"],
    ["L", "letras"],
    ["XL", "letras"],
    ["XXL", "letras"],
    ["6", "numeracion"],
    ["9", "numeracion"],
    ["26", "numeracion"],
    ["42", "numeracion"],
    ["Única", "unica"],
    ["Único", "unica"],
    ["Estándar", "unica"],
    ["Talla especial", "otras"],
  ] as const)("%s → %s", (talla, tipo) => {
    expect(tipoDeTalla(talla)).toBe(tipo);
  });

  it("ignora mayúsculas y espacios de más", () => {
    expect(tipoDeTalla(" xl ")).toBe("letras");
    expect(tipoDeTalla("única")).toBe("unica");
  });
});

describe("compararTallas — la curva se ordena como se lee", () => {
  it("letras de menor a mayor, no alfabético", () => {
    expect(["XL", "S", "XS", "M", "L", "XXL"].sort(compararTallas)).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
  });

  it("numeración por valor, no por texto (9 va antes que 26)", () => {
    expect(["26", "9", "42", "6"].sort(compararTallas)).toEqual(["6", "9", "26", "42"]);
  });
});
