import { describe, expect, it } from "vitest";
import { imprimirAlCobrar, queHacerAlRegistrar } from "./imprimir-al-cobrar";

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

describe("imprimirAlCobrar", () => {
  it("arranca apagado: un equipo que no lo encendió no imprime solo", () => {
    expect(imprimirAlCobrar.leerEnServidor()).toBe("no");
  });
});
