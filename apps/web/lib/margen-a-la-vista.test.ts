import { describe, expect, it } from "vitest";
import { cuentaDeLinea } from "./orden-compra-precio-ayuda";
import { facturaDelEnvio, margenALaVista, montoEscrito } from "./margen-a-la-vista";

describe("margenALaVista: cuánto se gana por prenda, con la cuenta de Compras (sin IGV)", () => {
  it("costo S/ 36 y precio S/ 70: 39 % sin factura y 49 % con factura (el caso que decía dos márgenes)", () => {
    expect(margenALaVista("36", "70")).toMatchObject({ ganancia: 23.32, tono: "normal", texto: "Ganas S/ 23.32 · 39 %" });
    expect(margenALaVista("36", "70", true)).toMatchObject({ ganancia: 28.81, tono: "normal", texto: "Ganas S/ 28.81 · 49 %" });
  });
  it("dice lo mismo que Compras, con factura y sin ella", () => {
    for (const conFactura of [false, true])
      for (const [c, p] of [[36, 70], [45, 59.9], [12.5, 39.9], [80, 79.9]] as const) {
        const compras = cuentaDeLinea(c, 0, conFactura, p);
        const linea = margenALaVista(c, p, conFactura);
        expect(linea?.pct).toBe((compras.margenPorMil ?? 0) / 10);
        expect(linea?.ganancia).toBeCloseTo(compras.ganancia ?? 0, 2);
      }
  });
  it("sin el dato de la factura se cuenta «sin factura», que nunca infla", () => {
    expect(margenALaVista(36, 70)?.pct).toBeLessThan(margenALaVista(36, 70, true)?.pct ?? 0);
  });
  it("el 30 % se mide sin IGV: 45 / 59.90 es bajo, y con factura también", () => {
    expect(margenALaVista(45, 59.9)).toMatchObject({ tono: "bajo", texto: "Ganas S/ 5.76 · 11 %" });
    expect(margenALaVista(45, 59.9, true)?.tono).toBe("bajo");
  });
  it("justo en 30 % es normal; el mismo costo y precio sin factura ya pierde (el IGV de la venta se va)", () => {
    expect(margenALaVista(70, 100, true)?.tono).toBe("normal");
    expect(margenALaVista(50, 50, true)).toMatchObject({ tono: "bajo", texto: "Ganas S/ 0 · 0 %" });
    expect(margenALaVista(50, 50)).toMatchObject({ tono: "pierdes", texto: "Pierdes S/ 7.63 · −18 %" });
  });
  it("sin costo, sin precio, o con un costo de regalo, no hay línea", () => {
    expect(margenALaVista("", "59.90")).toBeNull();
    expect(margenALaVista("30", "")).toBeNull();
    expect(margenALaVista(0, 59.9)).toBeNull();
    expect(margenALaVista("abc", "59.90")).toBeNull();
    expect(margenALaVista(null, undefined)).toBeNull();
  });
  it("cambia en vivo con cada precio que se escribe", () => {
    const tonos = ["5", "59", "59.9", "99"].map((p) => margenALaVista("45", p)?.tono);
    expect(tonos).toEqual(["pierdes", "bajo", "bajo", "normal"]);
  });
});

describe("facturaDelEnvio", () => {
  it("con papeles, solo si todos son factura", () => {
    expect(facturaDelEnvio([{ tipo: "factura" }], [])).toBe(true);
    expect(facturaDelEnvio([{ tipo: "factura" }, { tipo: "boleta" }], ["20123456789"])).toBe(false);
    expect(facturaDelEnvio([{ tipo: "sin_comprobante" }], ["20123456789"])).toBe(false);
    expect(facturaDelEnvio([{ tipo: null }], ["20123456789"])).toBe(false);
  });
  it("sin papeles, como Compras: factura si todos los proveedores tienen RUC", () => {
    expect(facturaDelEnvio([], ["20123456789"])).toBe(true);
    expect(facturaDelEnvio([], ["20123456789", null])).toBe(false);
    expect(facturaDelEnvio([], [" "])).toBe(false);
    expect(facturaDelEnvio([], [])).toBe(false);
  });
});

describe("montoEscrito", () => {
  it("lee lo que se escribe o se pega", () => {
    expect(montoEscrito("59,90")).toBe(59.9);
    expect(montoEscrito("S/ 59")).toBe(59);
    expect(montoEscrito(" 12.5 ")).toBe(12.5);
    expect(montoEscrito("12.")).toBeNull();
    expect(montoEscrito("")).toBeNull();
  });
});
