import { describe, expect, it } from "vitest";
import { pasoDeDescuento } from "./campana-hoja";
import { parsearDescuento } from "./etiqueta-campana";

describe("pasoDeDescuento (− y + de la hoja de campaña)", () => {
  it("sube y baja de 5 en 5", () => {
    expect(pasoDeDescuento("10", 5)).toBe("15");
    expect(pasoDeDescuento("15", -5)).toBe("10");
  });

  it("un decimal va al múltiplo de 5 más cercano en la dirección del toque", () => {
    expect(pasoDeDescuento("12.5", 5)).toBe("20");
    expect(pasoDeDescuento("12,5", -5)).toBe("10");
    expect(pasoDeDescuento("3", 5)).toBe("10");
  });

  it("vacío (sin descuento) sube a 5 y bajar de 5 vuelve a vacío", () => {
    expect(pasoDeDescuento("", 5)).toBe("5");
    expect(pasoDeDescuento("5", -5)).toBe("");
    expect(pasoDeDescuento("", -5)).toBe("");
  });

  it("no pasa de 100", () => {
    expect(pasoDeDescuento("100", 5)).toBe("100");
    expect(pasoDeDescuento("98", 5)).toBe("100");
  });

  it("lo mal escrito cuenta como cero", () => {
    expect(pasoDeDescuento("abc", 5)).toBe("5");
    expect(pasoDeDescuento("150", -5)).toBe("");
  });

  it("todo lo que devuelve se puede guardar (la misma regla que apaga «Guardar»)", () => {
    for (const texto of ["", "5", "12.5", "33", "97.5", "100", "abc", "-4"]) {
      for (const delta of [5, -5]) expect(parsearDescuento(pasoDeDescuento(texto, delta)).ok).toBe(true);
    }
  });
});
