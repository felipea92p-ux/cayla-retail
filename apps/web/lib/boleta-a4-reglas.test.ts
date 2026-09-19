import { describe, it, expect } from "vitest";
import { lineasA4, numeroA4 } from "./boleta-a4-reglas";
import { armarRecibo } from "./recibo-reglas";

// El A4 muestra los valores SIN IGV (como el original de Alegra) y la suma de la columna
// Total tiene que ser «Op. gravada» al centavo: si no, el papel se contradice a simple vista.

const cliente = { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null };
const comprobante = { tipo: "boleta" as const, serie: "B002", numero: 9380, created_at: "2026-09-05T19:40:51Z" };
const linea = (precioUnitario: number, extra: object = {}) => ({ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario, descuentoUnitario: 0, ...extra });

describe("lineasA4", () => {
  it("valor unitario y total van sin IGV, a 2 decimales (no «S/42.288136»)", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(49.9)], pagos: [{ metodo: "efectivo", monto: 49.9 }], tasaIgv: 0.18 });
    const [l] = lineasA4(r);
    expect(l).toMatchObject({ cantidad: 1, unidad: "Unidad", valorUnitario: 42.29, total: 42.29 });
  });

  it("la columna Total suma exactamente la Op. gravada, aunque el redondeo por línea no cuadre", () => {
    // 3 × 10.00 con IGV: 10/1.18 = 8.47 por línea (25.41) pero la gravada es 25.42.
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(10), linea(10), linea(10)], pagos: [{ metodo: "efectivo", monto: 30 }], tasaIgv: 0.18 });
    const ls = lineasA4(r);
    expect(r.subtotal).toBe(25.42);
    expect(ls.map((l) => l.total)).toEqual([8.47, 8.47, 8.48]); // el centavo de ajuste cae en la última línea
    expect(Math.round(ls.reduce((a, l) => a + l.total, 0) * 100) / 100).toBe(r.subtotal);
  });

  it("el descuento es el importe por unidad sin IGV (no un %)", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(49.9, { descuentoUnitario: 2.5 })], pagos: [{ metodo: "efectivo", monto: 47.4 }], tasaIgv: 0.18 });
    expect(lineasA4(r)[0]?.descuento).toBe(2.12); // 2.50 / 1.18
  });

  it("lleva el código y el detalle (talla · color) a la línea", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [linea(20, { detalle: "M · Negro" })], pagos: [{ metodo: "efectivo", monto: 20 }], tasaIgv: 0.18 });
    expect(lineasA4(r)[0]).toMatchObject({ codigo: "POL-1", detalle: "M · Negro" });
  });

  it("sin líneas no rompe", () => {
    const r = armarRecibo({ comprobante, sede: "Tienda TRU", cliente, lineas: [], pagos: [], tasaIgv: 0.18 });
    expect(lineasA4(r)).toEqual([]);
  });
});

describe("numeroA4", () => {
  it("el A4 lleva el correlativo a 8 dígitos, como la representación impresa de SUNAT (B002-00009380)", () => {
    expect(numeroA4({ serie: "B002", numero: 9380 })).toBe("B002-00009380");
    expect(numeroA4({ serie: "F001", numero: 7 })).toBe("F001-00000007");
  });
});
