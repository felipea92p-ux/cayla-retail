import { describe, expect, it } from "vitest";
import { ERROR_DIAS_LIQUIDAR, leerDiasLiquidar, pasoLiquidar } from "./analisis-liquidar-reglas";
import { LIQUIDAR_MAX, LIQUIDAR_MIN, liquidarDesdeValido } from "./analisis-reglas";

// «Liquidar desde» sin tope (Felipe, 2026-10-07): una caja con − y + en lugar de la barra de 30 a 85 días, y de 1 a 999 días, lo
// mismo que acepta la base (20261007100000).

describe("lo que se escribe en la caja de «Liquidar desde»", () => {
  it("acepta cualquier número entero de días de 1 a 999", () => {
    expect(LIQUIDAR_MIN).toBe(1);
    expect(LIQUIDAR_MAX).toBe(999);
    for (const [texto, dias] of [["1", 1], ["15", 15], ["60", 60], ["180", 180], ["999", 999], [" 45 ", 45], ["007", 7]] as const) {
      expect(leerDiasLiquidar(texto)).toBe(dias);
    }
  });
  it("no sirve: vacío, 0, negativo, decimales, letras o cuatro cifras", () => {
    for (const texto of ["", " ", "0", "-5", "4.5", "4,5", "abc", "60d", "1000"]) expect(leerDiasLiquidar(texto)).toBeNull();
    expect(ERROR_DIAS_LIQUIDAR).toBe("Escribe un número de días, de 1 a 999.");
  });
  it("cada toque de − o + suma o resta sin salirse de 1 a 999", () => {
    expect(pasoLiquidar(60, 5)).toBe(65);
    expect(pasoLiquidar(60, -5)).toBe(55);
    expect(pasoLiquidar(3, -5)).toBe(1);
    expect(pasoLiquidar(997, 5)).toBe(999);
  });
  it("lo que llega de la base se lleva al rango nuevo, no al de antes", () => {
    expect(liquidarDesdeValido(15)).toBe(15);
    expect(liquidarDesdeValido(180)).toBe(180);
    expect(liquidarDesdeValido(0)).toBe(1);
    expect(liquidarDesdeValido(5000)).toBe(999);
    expect(liquidarDesdeValido("no")).toBe(60);
  });
});
