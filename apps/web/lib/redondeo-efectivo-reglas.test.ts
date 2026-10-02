import { describe, it, expect } from "vitest";
import { UNIDAD_EFECTIVO, efectivoACobrar, redondeoDelEfectivo } from "./redondeo-efectivo-reglas";

// Los ejemplos de la ley (INDECOPI, Tip 04-2019 y nota del 12-jun-2019) y los de Felipe del 2026-10-02. La MISMA tabla va en
// `scripts/pruebas/redondeo_efectivo.mjs`, contra la base: la caja y la base tienen que dar lo mismo.
const EJEMPLOS: [number, number, number][] = [
  // [deuda en efectivo, se cobra, redondeo]
  [2.69, 2.6, 0.09], [5.99, 5.9, 0.09], [8.97, 8.9, 0.07], [5.46, 5.4, 0.06], [12.56, 12.5, 0.06], [2.75, 2.7, 0.05], [9.99, 9.9, 0.09],
  [100.02, 100, 0.02], [100.12, 100.1, 0.02], [100.19, 100.1, 0.09], [100.1, 100.1, 0], [100, 100, 0],
  // los bordes: lo que no llega a una moneda no se cobra; el descuento exacto de ADR-0302 deja estos céntimos
  [0.09, 0, 0.09], [0.05, 0, 0.05], [0.1, 0.1, 0], [0.29, 0.2, 0.09], [0.01, 0, 0.01],
  [67.91, 67.9, 0.01], [79.9, 79.9, 0], [33.15, 33.1, 0.05], [484.54, 484.5, 0.04], [62.15, 62.1, 0.05], [309.59, 309.5, 0.09],
  // los que la coma flotante cae mal: 4.35 × 100 = 434.99999999999994, 1.15 × 100 = 114.99999999999999
  [4.35, 4.3, 0.05], [1.15, 1.1, 0.05], [8.2, 8.2, 0], [0.57, 0.5, 0.07],
];

describe("redondeoEfectivo — S/ 0.10, siempre hacia abajo, solo lo que se paga en efectivo", () => {
  it("la unidad es la moneda más chica que circula: S/ 0.10", () => {
    expect(UNIDAD_EFECTIVO).toBe(0.1);
  });

  it.each(EJEMPLOS)("%s → se cobra %s y se redondea %s", (deuda, cobra, redondeo) => {
    expect(efectivoACobrar(deuda)).toBe(cobra);
    expect(redondeoDelEfectivo(deuda)).toBe(redondeo);
  });

  it("nunca sube: 100.19 se cobra 100.10, no 100.20 (subir es redondear en perjuicio del consumidor)", () => {
    expect(efectivoACobrar(100.19)).toBe(100.1);
    expect(efectivoACobrar(100.16)).toBe(100.1);
    expect(efectivoACobrar(100.15)).toBe(100.1);
  });

  it("100.12 no se cobra 100.12: no existe una moneda de 2 céntimos", () => {
    expect(efectivoACobrar(100.12)).toBe(100.1);
  });

  it("sin monto, o con un monto que no es un número, no hay nada que redondear", () => {
    for (const x of [0, -5, -0.01, NaN, Infinity, -Infinity]) {
      expect(efectivoACobrar(x)).toBe(0);
      expect(redondeoDelEfectivo(x)).toBe(0);
    }
  });

  // Las propiedades que la ley y el cajón exigen, en TODOS los montos de S/ 0.01 a S/ 999.99 (99 999), en céntimos enteros.
  it("en cada monto de 0.01 a 999.99: se cobra un múltiplo de 0.10, nunca más que la deuda, el redondeo es de 0 a 0.09 y suman la deuda", () => {
    let anterior = 0;
    const fallos: string[] = [];
    for (let c = 1; c <= 99_999; c++) {
      const deuda = c / 100;
      const cobra = efectivoACobrar(deuda);
      const redondeo = redondeoDelEfectivo(deuda);
      const cobraC = Math.round(cobra * 100);
      const redondeoC = Math.round(redondeo * 100);
      if (cobraC % 10 !== 0) fallos.push(`${deuda}: cobra ${cobra}, no es múltiplo de 0.10`);
      if (cobraC > c) fallos.push(`${deuda}: cobra ${cobra} más que la deuda`);
      if (redondeoC < 0 || redondeoC > 9) fallos.push(`${deuda}: redondeo ${redondeo} fuera de 0 a 0.09`);
      if (cobraC + redondeoC !== c) fallos.push(`${deuda}: ${cobra} + ${redondeo} no suma la deuda`);
      if (cobraC < anterior) fallos.push(`${deuda}: cobra menos que un monto menor (no es monótona)`);
      if (efectivoACobrar(cobra) !== cobra) fallos.push(`${deuda}: no es idempotente`);
      anterior = cobraC;
      if (fallos.length > 5) break;
    }
    expect(fallos).toEqual([]);
  });

  it("es la única solución: para cada deuda hay un solo redondeo en 0 a 0.09 que deja el efectivo en múltiplo de 0.10", () => {
    // Si hubiera dos, la base no podría exigir «el redondeo exacto de la ley» y un cliente manipulado podría mandar otro.
    for (let c = 1; c <= 99_999; c += 7) {
      const validos = [];
      for (let r = 0; r <= 9; r++) if ((c - r) % 10 === 0) validos.push(r);
      expect(validos).toEqual([Math.round(redondeoDelEfectivo(c / 100) * 100)]);
    }
  });
});
