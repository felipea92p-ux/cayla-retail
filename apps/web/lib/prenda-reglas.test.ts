import { describe, it, expect } from "vitest";
import { codigoDeEtiqueta, codigoPrenda } from "./prenda-reglas";

describe("codigoDeEtiqueta", () => {
  it("usa el código de etiqueta cuando el sku es NULL, como las prendas de Producto de Prueba", () => {
    expect(codigoDeEtiqueta({ codigo: "POL-0004-VIO-L", sku: null })).toBe("POL-0004-VIO-L");
    expect(codigoDeEtiqueta({ codigo: "POL-0004-VIO-L" })).toBe("POL-0004-VIO-L");
  });

  it("prefiere el código al sku legado, y cae al sku si la variante es vieja y no tiene código", () => {
    expect(codigoDeEtiqueta({ codigo: "VES-0002-NEG-M", sku: "VES-SOFI-NEG-M" })).toBe("VES-0002-NEG-M");
    expect(codigoDeEtiqueta({ codigo: null, sku: "VES-SOFI-NEG-M" })).toBe("VES-SOFI-NEG-M");
  });

  it("sin ninguno devuelve vacío, no un aviso: el resultado también alimenta búsquedas y CSV", () => {
    expect(codigoDeEtiqueta({ codigo: null, sku: null })).toBe("");
    expect(codigoDeEtiqueta({})).toBe("");
  });
});

describe("codigoPrenda", () => {
  it("muestra el código de etiqueta aunque la prenda no tenga sku", () => {
    expect(codigoPrenda({ codigo: "BLU-0001-NEG-S", sku: null })).toBe("BLU-0001-NEG-S");
  });

  it("muestra el código cuando el lector convirtió el sku nulo en ''", () => {
    // Así llega desde getCatalogo, getVentasRecientes y las lecturas de Devoluciones.
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
