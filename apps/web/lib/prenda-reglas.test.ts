import { describe, it, expect } from "vitest";
import { codigoPrenda } from "./prenda-reglas";

describe("codigoPrenda", () => {
  it("muestra el código de etiqueta aunque la prenda no tenga sku", () => {
    expect(codigoPrenda({ codigo: "BLU-0001-NEG-S", sku: null })).toBe("BLU-0001-NEG-S");
  });

  it("muestra el código cuando el lector convirtió el sku nulo en ''", () => {
    // Así llega desde getCatalogo, getVentasParaCambio y las lecturas de Devoluciones.
    expect(codigoPrenda({ codigo: "BLU-0003-NEG-M", sku: "" })).toBe("BLU-0003-NEG-M");
  });

  it("prefiere el código al sku legado cuando existen los dos", () => {
    expect(codigoPrenda({ codigo: "VES-0002-NEG-M", sku: "VES-SOFI-NEG-M" })).toBe("VES-0002-NEG-M");
  });

  it("cae al sku legado y, sin ninguno, lo dice en vez de dejar el hueco vacío", () => {
    expect(codigoPrenda({ codigo: null, sku: "VES-SOFI-NEG-M" })).toBe("VES-SOFI-NEG-M");
    expect(codigoPrenda({ codigo: null, sku: "" })).toBe("sin código");
  });
});
