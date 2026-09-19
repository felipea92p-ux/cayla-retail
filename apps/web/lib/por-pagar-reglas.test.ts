import { describe, expect, it } from "vitest";
import { detalleSeleccion, etiquetaVence, parseMonto, repartirPago, tramoDe } from "./por-pagar-reglas";

// Hoy en Lima = 2026-09-18 (a las 19:30 de Lima ya es 09-19 en UTC: el caso que rompía todo).
const AHORA = new Date("2026-09-19T00:30:00Z");

describe("tramoDe", () => {
  it("lo que la base marca vencida es vencida", () => {
    expect(tramoDe({ vencida: true, fechaVencimiento: "2026-09-04" }, AHORA)).toBe("vencidas");
  });
  it("vence hoy (Lima) NO es vencida aunque el servidor ya esté en mañana", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-18" }, AHORA)).toBe("semana");
  });
  it("hasta 7 días es esta semana; 8 en adelante, más adelante", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-25" }, AHORA)).toBe("semana");
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-26" }, AHORA)).toBe("despues");
  });
  it("sin fecha de vencimiento va a más adelante", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: null }, AHORA)).toBe("despues");
  });
});

describe("etiquetaVence", () => {
  it("rotula en relativo", () => {
    expect(etiquetaVence("2026-09-04", AHORA)).toBe("Venció hace 14 días");
    expect(etiquetaVence("2026-09-17", AHORA)).toBe("Venció ayer");
    expect(etiquetaVence("2026-09-18", AHORA)).toBe("Vence hoy");
    expect(etiquetaVence("2026-09-19", AHORA)).toBe("Vence mañana");
    expect(etiquetaVence("2026-10-09", AHORA)).toBe("Vence en 21 días");
  });
  it("muy vencida se dice en meses", () => {
    expect(etiquetaVence("2026-07-18", AHORA)).toBe("Venció hace 2 meses");
  });
});

describe("parseMonto", () => {
  it("acepta coma decimal, vacío como 0, y rechaza basura o negativos", () => {
    expect(parseMonto("1200,5")).toBe(1200.5);
    expect(parseMonto("")).toBe(0);
    expect(Number.isNaN(parseMonto("abc"))).toBe(true);
    expect(Number.isNaN(parseMonto("-5"))).toBe(true);
  });
});

describe("repartirPago", () => {
  const deudas = [
    { id: "b", saldo: 3186, fechaVencimiento: "2026-09-19", fechaEmision: "2026-08-20" },
    { id: "a", saldo: 4720, fechaVencimiento: "2026-09-04", fechaEmision: "2026-08-05" },
  ];
  it("paga el total: cada uno queda en su saldo", () => {
    expect(repartirPago(7906, deudas)).toEqual({ a: 4720, b: 3186 });
  });
  it("paga menos: cubre primero la más vencida", () => {
    expect(repartirPago(5000, deudas)).toEqual({ a: 4720, b: 280 });
    expect(repartirPago(1000, deudas)).toEqual({ a: 1000, b: 0 });
  });
  it("si el total supera la deuda, no pasa del saldo", () => {
    expect(repartirPago(99999, deudas)).toEqual({ a: 4720, b: 3186 });
  });
  it("la suma cuadra al céntimo con decimales", () => {
    const r = repartirPago(100.1, [
      { id: "x", saldo: 33.33, fechaVencimiento: "2026-09-01", fechaEmision: "2026-08-01" },
      { id: "y", saldo: 33.33, fechaVencimiento: "2026-09-02", fechaEmision: "2026-08-01" },
      { id: "z", saldo: 99, fechaVencimiento: "2026-09-03", fechaEmision: "2026-08-01" },
    ]);
    expect(r).toEqual({ x: 33.33, y: 33.33, z: 33.44 });
    expect(Math.round((r.x + r.y + r.z) * 100)).toBe(10010);
  });
  it("empate de vencimiento: la de emisión más antigua primero", () => {
    const r = repartirPago(10, [
      { id: "nueva", saldo: 100, fechaVencimiento: "2026-09-10", fechaEmision: "2026-09-01" },
      { id: "vieja", saldo: 100, fechaVencimiento: "2026-09-10", fechaEmision: "2026-08-01" },
    ]);
    expect(r).toEqual({ vieja: 10, nueva: 0 });
  });
});

describe("detalleSeleccion", () => {
  it("dice de qué está hecho el total", () => {
    const f = (n: number) => `S/ ${n}`;
    const filas = [
      { vencida: true, fechaVencimiento: "2026-09-04", saldo: 4720 },
      { vencida: false, fechaVencimiento: "2026-09-19", saldo: 3186 },
    ];
    expect(detalleSeleccion(filas, f, AHORA)).toBe("Vencido S/ 4720 + vence esta semana S/ 3186");
  });
});
