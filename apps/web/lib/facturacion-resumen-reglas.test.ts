import { describe, expect, it } from "vitest";
import { antiguedad, faltaPara, progresoDeEnvio } from "./facturacion-resumen-reglas";

describe("antiguedad", () => {
  const AHORA = new Date("2026-09-18T20:00:00Z");
  const hace = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000).toISOString();

  it("menos de un minuto: «hace instantes»", () => {
    expect(antiguedad(hace(0), AHORA)).toBe("hace instantes");
    expect(antiguedad(hace(59), AHORA)).toBe("hace instantes");
  });

  it("minutos: «hace 12 min»", () => {
    expect(antiguedad(hace(60), AHORA)).toBe("hace 1 min");
    expect(antiguedad(hace(12 * 60 + 30), AHORA)).toBe("hace 12 min");
    expect(antiguedad(hace(59 * 60 + 59), AHORA)).toBe("hace 59 min");
  });

  it("horas y minutos: «hace 6 h 42 min»; en punto solo las horas", () => {
    expect(antiguedad(hace(6 * 3600 + 42 * 60), AHORA)).toBe("hace 6 h 42 min");
    expect(antiguedad(hace(3 * 3600), AHORA)).toBe("hace 3 h");
    expect(antiguedad(hace(23 * 3600 + 59 * 60), AHORA)).toBe("hace 23 h 59 min");
  });

  it("desde 24 h: días enteros, «hace 3 d»", () => {
    expect(antiguedad(hace(24 * 3600), AHORA)).toBe("hace 1 d");
    expect(antiguedad(hace(3 * 24 * 3600 + 5 * 3600), AHORA)).toBe("hace 3 d");
  });

  it("nunca negativa: un reloj adelantado se lee como «hace instantes»", () => {
    expect(antiguedad(hace(-300), AHORA)).toBe("hace instantes");
  });
});

describe("progresoDeEnvio", () => {
  it("cuenta enviados y aceptados sobre los comprobantes que no son anulados ni no emitidos", () => {
    const filas = [
      { estado: "aceptado" as const },
      { estado: "enviado" as const },
      { estado: "pendiente" as const },
      { estado: "rechazado" as const },
      { estado: "anulado" as const },
      { estado: "no_emitido" as const },
    ];
    expect(progresoDeEnvio(filas)).toEqual({ enviados: 2, total: 4 });
  });

  it("sin comprobantes hoy: 0 de 0 (la tarjeta lo dice con palabras, no con una barra vacía)", () => {
    expect(progresoDeEnvio([])).toEqual({ enviados: 0, total: 0 });
  });
});

describe("faltaPara", () => {
  const AHORA = new Date("2026-09-18T20:00:00Z");
  const dentroDe = (segundos: number) => new Date(AHORA.getTime() + segundos * 1000).toISOString();

  it("menos de un minuto (o ya pasado): «instantes», nunca un número negativo", () => {
    expect(faltaPara(dentroDe(30), AHORA)).toBe("instantes");
    expect(faltaPara(dentroDe(-3600), AHORA)).toBe("instantes");
  });

  it("minutos, horas con sus minutos y días: la misma forma que antiguedad", () => {
    expect(faltaPara(dentroDe(45 * 60), AHORA)).toBe("45 min");
    expect(faltaPara(dentroDe(5 * 3600 + 20 * 60), AHORA)).toBe("5 h 20 min");
    expect(faltaPara(dentroDe(3 * 3600), AHORA)).toBe("3 h");
    expect(faltaPara(dentroDe(2 * 24 * 3600 + 3600), AHORA)).toBe("2 d");
  });
});
