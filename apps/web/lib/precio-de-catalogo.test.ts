import { describe, it, expect } from "vitest";
import { rangoDeCatalogo, solesDeCatalogo } from "./precio-de-catalogo";

const S = "S/ ";

describe("solesDeCatalogo — sin «.00», como los catálogos de moda (Felipe 2026-11-02)", () => {
  it("un precio redondo pierde los céntimos", () => {
    expect(solesDeCatalogo(90)).toBe(`${S}90`);
    expect(solesDeCatalogo(49)).toBe(`${S}49`);
  });
  it("los céntimos que existen se dicen, siempre con dos cifras", () => {
    expect(solesDeCatalogo(89.9)).toBe(`${S}89.90`);
    expect(solesDeCatalogo(89.95)).toBe(`${S}89.95`);
    expect(solesDeCatalogo(0.5)).toBe(`${S}0.50`);
  });
  it("decide por los céntimos redondeados, no por el error del punto flotante", () => {
    expect(solesDeCatalogo(89.9 + 0.1)).toBe(`${S}90`);
    expect(solesDeCatalogo(89.99999999)).toBe(`${S}90`);
    expect(solesDeCatalogo(0.1 + 0.2)).toBe(`${S}0.30`);
  });
  it("los miles van con coma, como el resto del ERP (es-PE)", () => {
    expect(solesDeCatalogo(1290)).toBe(`${S}1,290`);
    expect(solesDeCatalogo(1290.5)).toBe(`${S}1,290.50`);
  });
  it("el cero (la bolsa de obsequio) también se dice", () => {
    expect(solesDeCatalogo(0)).toBe(`${S}0`);
  });
  it("entre «S/» y el número va un espacio que no se parte", () => {
    expect(solesDeCatalogo(90)).not.toContain(" ");
  });
});

describe("rangoDeCatalogo — cuando las tallas no cuestan lo mismo", () => {
  it("un solo precio es un precio", () => {
    expect(rangoDeCatalogo([90, 90, 90])).toBe(`${S}90`);
    expect(rangoDeCatalogo([89.9])).toBe(`${S}89.90`);
  });
  it("de menor a mayor, con «S/» una vez y cada punta con su regla", () => {
    expect(rangoDeCatalogo([89, 79, 99])).toBe(`${S}79–99`);
    expect(rangoDeCatalogo([89, 79.9])).toBe(`${S}79.90–89`);
  });
  it("dos precios que solo difieren por el punto flotante son el mismo", () => {
    expect(rangoDeCatalogo([90, 89.9 + 0.1])).toBe(`${S}90`);
  });
  it("sin ningún precio de verdad, null", () => {
    expect(rangoDeCatalogo([])).toBeNull();
    expect(rangoDeCatalogo([null, Number.NaN])).toBeNull();
  });
  it("ignora los huecos y se queda con los que hay", () => {
    expect(rangoDeCatalogo([null, 59, Number.POSITIVE_INFINITY])).toBe(`${S}59`);
  });
});
