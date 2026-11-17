import { describe, expect, it } from "vitest";
import { imprimirAlCobrar, imprimirEnLaCaja, queHacerAlRegistrar } from "./imprimir-al-cobrar";

const base = { encendido: true, hayComprobante: true, sinConexion: false, vuelto: 0 };

describe("queHacerAlRegistrar", () => {
  it("apagado, la hoja espera el botón como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, encendido: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, encendido: false, vuelto: 20 })).toBe("esperar");
  });

  it("encendido y sin vuelto, imprime y vuelve a una venta nueva", () => {
    expect(queHacerAlRegistrar(base)).toBe("imprimir-y-seguir");
  });

  it("encendido y con vuelto, imprime pero se queda abierta para que la cajera vea cuánto entregar", () => {
    expect(queHacerAlRegistrar({ ...base, vuelto: 0.1 })).toBe("imprimir-y-quedarse");
    expect(queHacerAlRegistrar({ ...base, vuelto: 50 })).toBe("imprimir-y-quedarse");
  });

  it("sin comprobante o guardada sin conexión no hay nada que imprimir: espera, aunque esté encendido", () => {
    expect(queHacerAlRegistrar({ ...base, hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, sinConexion: true, vuelto: 10 })).toBe("esperar");
  });
});

describe("queHacerAlRegistrar con «Imprimir en la caja»", () => {
  it("manda la boleta a la caja, aunque también esté encendido «Imprimir solo al cobrar»", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1" })).toBe("mandar-a-la-caja");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true, ventaId: "v1", vuelto: 20 })).toBe("mandar-a-la-caja");
  });

  it("sin venta guardada en el servidor no hay qué pedir: sigue como siempre", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: null })).toBe("imprimir-y-seguir");
    expect(queHacerAlRegistrar({ ...base, encendido: false, enLaCaja: true })).toBe("esperar");
  });

  it("sin comprobante o sin conexión, tampoco se manda nada a la caja", () => {
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", hayComprobante: false })).toBe("esperar");
    expect(queHacerAlRegistrar({ ...base, enLaCaja: true, ventaId: "v1", sinConexion: true })).toBe("esperar");
  });
});

describe("imprimirEnLaCaja", () => {
  it("arranca apagado: un equipo que no lo encendió imprime donde cobra", () => {
    expect(imprimirEnLaCaja.leerEnServidor()).toBe("no");
  });
});

describe("imprimirAlCobrar", () => {
  it("arranca apagado: un equipo que no lo encendió no imprime solo", () => {
    expect(imprimirAlCobrar.leerEnServidor()).toBe("no");
  });
});
