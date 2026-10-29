import { describe, expect, it } from "vitest";
import {
  leerCierreClaure,
  lineaDeHoy,
  lineaDelEfectivo,
  mensajeParaClaudia,
  titularDelCierre,
  type CierreClaure,
} from "./cierre-claure-reglas";

// Lo mismo que arma `scripts/pruebas/claure_cierre.mjs` contra Postgres: lo que la base devuelve, leído aquí.
const CRUDO = {
  hay_claure: true,
  sede: "Tienda LIM",
  fecha: "2026-10-28",
  puede_pagar: true,
  saldo: 175.6,
  saldo_anterior: 49,
  hoy: { cobrado: 168, devuelto: 0, comision: 1.4, pagado: 40 },
  por_medio: [
    { medio: "tarjeta", monto: 50, comision: 1.4 },
    { medio: "yape", monto: 118, comision: 0 },
  ],
  efectivo: { total: 200, claure: 150, cayla: 50 },
  cambios_por_revisar: 0,
};
const cierre = (cambios: Partial<CierreClaure> = {}): CierreClaure => ({ ...leerCierreClaure(CRUDO)!, ...cambios });

describe("leerCierreClaure", () => {
  it("lee lo que devuelve la base", () => {
    expect(leerCierreClaure(CRUDO)).toMatchObject({
      sede: "Tienda LIM",
      fecha: "2026-10-28",
      puedePagar: true,
      saldo: 175.6,
      saldoAnterior: 49,
      hoy: { cobrado: 168, comision: 1.4, pagado: 40 },
      efectivo: { total: 200, claure: 150, cayla: 50 },
    });
    expect(leerCierreClaure(CRUDO)!.porMedio).toHaveLength(2);
  });
  it("si CLAURE no opera en esa sede (o lo recibido no es un cierre), no hay nada que decir", () => {
    expect(leerCierreClaure({ hay_claure: false })).toBeNull();
    expect(leerCierreClaure(null)).toBeNull();
    expect(leerCierreClaure("texto")).toBeNull();
    expect(leerCierreClaure([])).toBeNull();
  });
  it("lee los números que llegan como texto y no revienta con campos que faltan", () => {
    const c = leerCierreClaure({ hay_claure: true, saldo: "10.50" })!;
    expect(c.saldo).toBe(10.5);
    expect(c.porMedio).toEqual([]);
    expect(c.efectivo).toEqual({ total: 0, claure: 0, cayla: 0 });
    expect(c.puedePagar).toBe(false);
  });
});

describe("lo que dice el bloque", () => {
  it("el titular es lo que se le debe; con saldo negativo, lo que ella le debe a CAYLA (en positivo)", () => {
    expect(titularDelCierre(cierre())).toEqual({ frase: "Se le debe a Claudia", monto: 175.6 });
    expect(titularDelCierre(cierre({ saldo: -2.4 }))).toEqual({ frase: "Claudia te debe", monto: 2.4 });
    expect(titularDelCierre(cierre({ saldo: 0 }))).toEqual({ frase: "Se le debe a Claudia", monto: 0 });
  });
  it("la línea de hoy dice cuánto y con qué medios; sin cobros lo dice", () => {
    expect(lineaDeHoy(cierre())).toBe("Hoy se cobró S/ 168.00 de CLAURE en tus cuentas (Tarjeta S/ 50.00 · Yape S/ 118.00), la comisión del POS es S/ 1.40.");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 0, devuelto: 0, comision: 0, pagado: 0 }, porMedio: [] }))).toBe("Hoy no se cobró nada de CLAURE en tus cuentas.");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 100, devuelto: 30, comision: 0, pagado: 0 } }))).toContain("se devolvió S/ 30.00");
  });
  it("el efectivo se dice partido: lo de CLAURE no suma a lo que se le debe", () => {
    expect(lineaDelEfectivo(cierre())).toBe("Del efectivo de hoy, S/ 150.00 es de CLAURE (lo tiene Claudia, no suma a lo que se le debe) y S/ 50.00 es de CAYLA.");
  });
});

describe("mensajeParaClaudia", () => {
  it("arma el resumen de WhatsApp con lo del día y el saldo", () => {
    expect(mensajeParaClaudia(cierre())).toBe(
      [
        "Hola Claudia, el resumen del cierre de caja de Tienda LIM (28/10/2026):",
        "",
        "• Cobrado de CLAURE en cuentas de CAYLA: S/ 168.00 (Tarjeta S/ 50.00, Yape S/ 118.00)",
        "• Comisión del POS: S/ 1.40",
        "• Ya se te pagó hoy: S/ 40.00",
        "• Efectivo de CLAURE de hoy (lo tienes tú): S/ 150.00",
        "",
        "Saldo que te debemos: S/ 175.60",
      ].join("\n"),
    );
  });
  it("no pone renglones vacíos: sin comisión, devoluciones, pagos ni efectivo de CLAURE, solo lo cobrado y el saldo", () => {
    const m = mensajeParaClaudia(cierre({ hoy: { cobrado: 0, devuelto: 0, comision: 0, pagado: 0 }, porMedio: [], efectivo: { total: 0, claure: 0, cayla: 0 } }));
    expect(m).not.toContain("Comisión");
    expect(m).not.toContain("Devuelto");
    expect(m).not.toContain("Ya se te pagó");
    expect(m).not.toContain("Efectivo de CLAURE");
    expect(m).toContain("Saldo que te debemos: S/ 175.60");
  });
  it("si se le pagó de más, el saldo dice que queda a favor de CAYLA", () => {
    expect(mensajeParaClaudia(cierre({ saldo: -2.4 }))).toContain("Saldo: se te pagó de más, S/ 2.40 quedan a favor de CAYLA.");
  });
});
