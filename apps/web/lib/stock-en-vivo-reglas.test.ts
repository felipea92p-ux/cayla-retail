import { describe, expect, it } from "vitest";
import { mismoStock, type StockReleido } from "./stock-en-vivo-reglas";

const stock = (cobrable: Record<string, number>, almacen: Record<string, number | null> = {}, apartado: Record<string, number> = {}): StockReleido => ({
  cobrable: new Map(Object.entries(cobrable)),
  almacen: new Map(Object.entries(almacen)),
  apartado: new Map(Object.entries(apartado)),
});

describe("mismoStock (auditoría 2026-09-29: el sondeo no debe avisar si no cambió nada)", () => {
  it("dos lecturas con los mismos valores son iguales, aunque los Map sean instancias distintas", () => {
    expect(mismoStock(stock({ a: 3, b: 0 }), stock({ a: 3, b: 0 }))).toBe(true);
  });
  it("una cantidad distinta ya no es la misma lectura", () => {
    expect(mismoStock(stock({ a: 3 }), stock({ a: 2 }))).toBe(false);
  });
  it("una prenda nueva (o una que desapareció) ya no es la misma lectura", () => {
    expect(mismoStock(stock({ a: 3 }), stock({ a: 3, b: 1 }))).toBe(false);
    expect(mismoStock(stock({ a: 3, b: 1 }), stock({ a: 3 }))).toBe(false);
  });
  it("compara también almacén y apartado, no solo lo cobrable", () => {
    expect(mismoStock(stock({ a: 1 }, { a: 2 }), stock({ a: 1 }, { a: 3 }))).toBe(false);
    expect(mismoStock(stock({ a: 1 }, {}, { a: 1 }), stock({ a: 1 }, {}, { a: 2 }))).toBe(false);
  });
  it("null en el almacén (sin almacén en esa sede) se distingue de 0", () => {
    expect(mismoStock(stock({}, { a: null }), stock({}, { a: 0 }))).toBe(false);
    expect(mismoStock(stock({}, { a: null }), stock({}, { a: null }))).toBe(true);
  });
});
