import { describe, it, expect } from "vitest";
import { codigoPrenda, opcionesDeCambio } from "./cambios-reglas";

// El caso que rompía (2026-09-16): dos prendas del censo, ambas sin sku. Buscar "la
// vendida" por sku calzaba con la primera sin sku del catálogo, no con la vendida.
const catalogo = [
  { varianteId: "v-blusa-s", sku: null, codigo: "BLU-0001-NEG-S", stockAqui: 3 },
  { varianteId: "v-blusa-m", sku: null, codigo: "BLU-0001-NEG-M", stockAqui: 2 },
  { varianteId: "v-vestido-m", sku: "VES-SOFI-NEG-M", codigo: "VES-0002-NEG-M", stockAqui: 0 },
];

describe("opcionesDeCambio", () => {
  it("excluye la variante vendida aunque otras prendas tampoco tengan sku", () => {
    const opciones = opcionesDeCambio(catalogo, "v-blusa-m").map((v) => v.varianteId);
    expect(opciones).not.toContain("v-blusa-m");
    expect(opciones).toContain("v-blusa-s");
  });

  it("no ofrece una variante sin stock en la sede", () => {
    expect(opcionesDeCambio(catalogo, "v-blusa-s").map((v) => v.varianteId)).toEqual(["v-blusa-m"]);
  });
});

describe("codigoPrenda", () => {
  it("muestra el código de etiqueta aunque la prenda no tenga sku", () => {
    expect(codigoPrenda({ codigo: "BLU-0001-NEG-S", sku: null })).toBe("BLU-0001-NEG-S");
  });

  it("prefiere el código al sku legado cuando existen los dos", () => {
    expect(codigoPrenda({ codigo: "VES-0002-NEG-M", sku: "VES-SOFI-NEG-M" })).toBe("VES-0002-NEG-M");
  });

  it("cae al sku legado y, sin ninguno, lo dice en vez de dejar el hueco vacío", () => {
    expect(codigoPrenda({ codigo: null, sku: "VES-SOFI-NEG-M" })).toBe("VES-SOFI-NEG-M");
    expect(codigoPrenda({ codigo: null, sku: "" })).toBe("sin código");
  });
});
