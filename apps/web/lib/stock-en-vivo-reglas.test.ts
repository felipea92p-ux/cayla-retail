import { describe, expect, it } from "vitest";
import { claveDeConocidos, hayQueReleer, huellaParaRecordar, mismoStock, type StockReleido } from "./stock-en-vivo-reglas";

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

describe("hayQueReleer (auditoría 2026-10-13, punto 20: no bajar 1.507 filas si nada cambió)", () => {
  const h1 = "a".repeat(32);
  const h2 = "b".repeat(32);
  const prendas = claveDeConocidos(["v2", "v1"]);
  it("la primera vuelta siempre relee: no hay con qué comparar", () => {
    expect(hayQueReleer(null, h1, prendas)).toBe(true);
  });
  it("misma huella y mismas prendas: no relee", () => {
    expect(hayQueReleer({ huella: h1, conocidos: prendas }, h1, prendas)).toBe(false);
  });
  it("la huella cambió (alguien vendió, repuso o apartó): relee", () => {
    expect(hayQueReleer({ huella: h1, conocidos: prendas }, h2, prendas)).toBe(true);
  });
  it("sin huella (la función no existe en esa base o falló): relee, más lento pero nunca viejo", () => {
    expect(hayQueReleer({ huella: h1, conocidos: prendas }, null, prendas)).toBe(true);
  });
  it("una prenda nueva en el catálogo obliga a releer aunque el stock no se haya movido", () => {
    expect(hayQueReleer({ huella: h1, conocidos: prendas }, h1, claveDeConocidos(["v1", "v2", "v3"]))).toBe(true);
  });
  it("las mismas prendas en otro orden no cuentan como cambio", () => {
    expect(claveDeConocidos(["v2", "v1"])).toBe(claveDeConocidos(["v1", "v2"]));
    expect(hayQueReleer({ huella: h1, conocidos: prendas }, h1, claveDeConocidos(["v1", "v2"]))).toBe(false);
  });
});

describe("huellaParaRecordar (revisión 2026-10-13: un cambio que va y vuelve entre la huella y las filas)", () => {
  const h = "a".repeat(32);
  it("si la huella de después coincide con la de antes, se recuerda", () => {
    expect(huellaParaRecordar(h, h, "v1")).toEqual({ huella: h, conocidos: "v1" });
  });
  it("si cambió en medio, no se recuerda nada: la próxima vuelta relee", () => {
    expect(huellaParaRecordar(h, "b".repeat(32), "v1")).toBeNull();
  });
  it("sin huella (antes o después), no se recuerda nada", () => {
    expect(huellaParaRecordar(null, h, "v1")).toBeNull();
    expect(huellaParaRecordar(h, null, "v1")).toBeNull();
  });
});
