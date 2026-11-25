import { describe, expect, it } from "vitest";
import {
  detalleDelAvisoAlCobrar,
  imprimirAlCobrar,
  imprimirAlCobrarDeFabrica,
  imprimirEnLaCaja,
  queHacerAlRegistrar,
} from "./imprimir-al-cobrar";

const base = { encendido: true, hayComprobante: true, sinConexion: false };

describe("queHacerAlRegistrar", () => {
  it("apagado, la hoja espera el botón como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, encendido: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, encendido: false, conWhatsapp: true })).toBe("esperar");
  });

  it("encendido, imprime y vuelve a una venta nueva sin hoja, haya vuelto o no (el vuelto lo dice el aviso)", () => {
    expect(queHacerAlRegistrar(base)).toBe("imprimir-sin-hoja");
    expect(queHacerAlRegistrar({ ...base, conWhatsapp: false })).toBe("imprimir-sin-hoja");
  });

  it("encendido y con un WhatsApp que ofrecer, imprime y deja la hoja abierta para enviarlo", () => {
    expect(queHacerAlRegistrar({ ...base, conWhatsapp: true })).toBe("imprimir-y-quedarse");
  });

  it("sin comprobante o guardada sin conexión no hay nada que imprimir: la hoja espera, aunque esté encendido", () => {
    expect(queHacerAlRegistrar({ ...base, hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true, conWhatsapp: true })).toBe("esperar");
  });
});

describe("queHacerAlRegistrar con «Imprimir en la caja»", () => {
  it("manda la boleta a la caja, aunque también esté encendido «Imprimir solo al cobrar»", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
  });

  it("sin venta guardada en el servidor no hay qué pedir: sigue como si no estuviera", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: null })).toBe("imprimir-sin-hoja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true })).toBe("esperar");
  });

  it("sin comprobante o sin conexión, tampoco se manda nada a la caja", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", sinConexion: true })).toBe("esperar");
  });
});

describe("imprimirAlCobrarDeFabrica", () => {
  it("encendido en un computador; apagado si el puntero principal es un dedo (teléfono o tablet del piso)", () => {
    expect(imprimirAlCobrarDeFabrica(false)).toBe("si");
    expect(imprimirAlCobrarDeFabrica(true)).toBe("no");
  });
});

describe("detalleDelAvisoAlCobrar", () => {
  it("el comprobante y, si hubo, el vuelto", () => {
    expect(detalleDelAvisoAlCobrar({ comprobante: "Boleta B001-000123", vuelto: 30.2 })).toBe("Boleta B001-000123 · Vuelto S/30.20");
    expect(detalleDelAvisoAlCobrar({ comprobante: "Factura F001-000007", vuelto: 0 })).toBe("Factura F001-000007");
  });
});

describe("imprimirEnLaCaja", () => {
  it("arranca apagado: un equipo que no lo encendió imprime donde cobra", () => {
    expect(imprimirEnLaCaja.leerEnServidor()).toBe("no");
  });
});

describe("imprimirAlCobrar", () => {
  it("en el servidor no se sabe qué equipo es: arranca apagado y el navegador lo corrige al hidratar", () => {
    expect(imprimirAlCobrar.leerEnServidor()).toBe("no");
  });
});
