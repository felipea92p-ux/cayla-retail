import { describe, it, expect } from "vitest";
import { costoBase, costoParaTipear, totalesCompra } from "./compras-reglas";

// El costo unitario que se guarda alimenta el costo de la variante y el
// margen de cada venta. Si el descuento del IGV se hace mal, la mercadería
// entra un 18 % más cara de lo real y todos los márgenes salen chicos — y
// nadie lo nota, porque el total de la factura sí cuadra con el papel.

describe("costoBase", () => {
  it("sin IGV devuelve lo tipeado, redondeado a 2 decimales como la base", () => {
    expect(costoBase(100, 18, false)).toBe(100);
    expect(costoBase(38.898, 18, false)).toBe(38.9);
  });

  it("con IGV descuenta el porcentaje", () => {
    expect(costoBase(118, 18, true)).toBe(100);
    expect(costoBase(59, 18, true)).toBe(50);
    expect(costoBase(45.9, 18, true)).toBe(38.9);
  });

  it("con IGV pero porcentaje 0 (boleta, nota de venta) no descuenta nada", () => {
    expect(costoBase(118, 0, true)).toBe(118);
  });

  it("basura numérica cae a 0, nunca a NaN", () => {
    expect(costoBase(NaN, 18, true)).toBe(0);
    expect(costoBase(-5, 18, false)).toBe(0);
  });
});

describe("costoParaTipear", () => {
  it("es el inverso de costoBase para el costo sugerido de la variante", () => {
    expect(costoParaTipear(100, 18, true)).toBe(118);
    expect(costoParaTipear(100, 18, false)).toBe(100);
    expect(costoBase(costoParaTipear(38.9, 18, true), 18, true)).toBe(38.9);
  });
});

describe("totalesCompra", () => {
  it("con IGV incluido, el total es el del papel y el IGV absorbe el redondeo", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: 10 }], 18, true)).toEqual({ subtotal: 8.47, igv: 1.53, total: 10 });
    expect(totalesCompra([{ cantidad: 3, costoTipeado: 10 }], 18, true)).toEqual({ subtotal: 25.41, igv: 4.59, total: 30 });
  });

  it("sin IGV incluido, el IGV se calcula sobre la base como siempre", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: 100 }], 18, false)).toEqual({ subtotal: 100, igv: 18, total: 118 });
  });

  it("boleta (IGV 0) con el interruptor prendido: nada que descontar", () => {
    expect(totalesCompra([{ cantidad: 2, costoTipeado: 10 }], 0, true)).toEqual({ subtotal: 20, igv: 0, total: 20 });
  });

  it("líneas vacías o basura no aportan", () => {
    expect(totalesCompra([{ cantidad: 1, costoTipeado: NaN }], 18, true)).toEqual({ subtotal: 0, igv: 0, total: 0 });
  });
});
