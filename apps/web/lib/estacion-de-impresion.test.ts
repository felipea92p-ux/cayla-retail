import { describe, expect, it } from "vitest";
import { estacionActiva, estacionDeLaCaja, fraseDeVoz, vozDeLaEstacion } from "./estacion-de-impresion";

describe("estacionActiva", () => {
  it("solo imprime lo del piso en la ventana «CAYLA Caja» y con su interruptor encendido", () => {
    expect(estacionActiva("caja", "si")).toBe(true);
    expect(estacionActiva("caja", "no")).toBe(false);
    expect(estacionActiva("normal", "si")).toBe(false);
    expect(estacionActiva("etiquetas", "si")).toBe(false);
  });
  it("en la Mac con la ticketera en su ayudante, desde el Chrome de siempre", () => {
    expect(estacionActiva("normal", "si", true)).toBe(true);
    expect(estacionActiva("normal", "no", true)).toBe(false);
  });
});

describe("fraseDeVoz", () => {
  it("dice el monto como en la tienda", () => {
    expect(fraseDeVoz("boleta", 79.9)).toBe("Boleta de 79 soles con 90 lista");
    expect(fraseDeVoz("boleta", 80)).toBe("Boleta de 80 soles lista");
    expect(fraseDeVoz("boleta", 1)).toBe("Boleta de 1 sol lista");
    expect(fraseDeVoz("boleta", 149.05)).toBe("Boleta de 149 soles con 05 lista");
    expect(fraseDeVoz("factura", 250.5)).toBe("Factura de 250 soles con 50 lista");
    expect(fraseDeVoz("nota_venta", 30)).toBe("Nota de venta de 30 soles lista");
  });
  it("no se confunde con los decimales de coma flotante", () => {
    expect(fraseDeVoz("boleta", 0.1 + 0.2)).toBe("Boleta de 0 soles con 30 lista");
    expect(fraseDeVoz("boleta", 74.895)).toMatch(/^Boleta de 74 soles con 9\d lista$/);
  });
});

describe("las preferencias de la estación", () => {
  it("la estación arranca apagada y su voz encendida", () => {
    expect(estacionDeLaCaja.leerEnServidor()).toBe("no");
    expect(vozDeLaEstacion.leerEnServidor()).toBe("si");
  });
});
