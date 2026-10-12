import { describe, expect, it } from "vitest";
import { ERROR_DIAS_LIQUIDAR, leerDiasLiquidar, pasoLiquidar } from "./analisis-liquidar-reglas";
import { etiquetasEje, finDelEje, marcasEje, pistaQuieta } from "./analisis-quietas";
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

describe("el carril «Días sin venderse» se alarga si «Liquidar desde» pasa de 4 meses", () => {
  it("hasta 100 días el eje llega a 4 meses, como antes", () => {
    for (const d of [1, 30, 60, 85, 100]) expect(finDelEje(d)).toBe(120);
    expect(marcasEje(60)).toEqual({ liquidar: 50, tresMeses: 75 });
    expect(etiquetasEje(60)).toEqual({ fin: "4 meses", tresMeses: true });
  });
  it("con más, termina en un mes justo con aire detrás de la marca", () => {
    expect(finDelEje(101)).toBe(150);
    expect(finDelEje(180)).toBe(210);
    expect(etiquetasEje(180).fin).toBe("7 meses");
    expect(marcasEje(180).liquidar).toBeCloseTo((180 / 210) * 100, 6);
    expect(finDelEje(999)).toBeGreaterThan(999);
  });
  it("«3 meses» se calla si pisaría a «Liquidar»", () => {
    expect(etiquetasEje(85).tresMeses).toBe(false);
    expect(etiquetasEje(95).tresMeses).toBe(false);
    expect(etiquetasEje(15).tresMeses).toBe(true);
  });
  it("una prenda de 104 días queda dentro del carril también con «Liquidar desde» en 180", () => {
    const { n } = pistaQuieta(104, 180);
    expect(n).toBeCloseTo(104 / 210, 6);
    expect(pistaQuieta(104, 60).n).toBeCloseTo(104 / 120, 6);
  });
});
