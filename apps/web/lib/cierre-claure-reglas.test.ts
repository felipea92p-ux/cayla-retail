import { describe, expect, it } from "vitest";
import {
  leerCierreClaure,
  lineaDeHoy,
  lineaDelEfectivo,
  mensajeParaClaudia,
  titularDelCierre,
  vistaPreviaSeQueda,
  type CierreClaure,
} from "./cierre-claure-reglas";

// Lo mismo que arma `scripts/pruebas/claure_cierre.mjs` contra Postgres: lo que la base devuelve, leído aquí.
const CRUDO = {
  hay_claure: true,
  sede: "Tienda LIM",
  fecha: "2026-10-28",
  puede_pagar: true,
  saldo: 140.97,
  saldo_anterior: 40,
  hoy: { cobrado: 168, devuelto: 0, igv: 25.63, comision: 1.4, pagado: 40, efectivo_claudia: 0, gastos: 0 },
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
      saldo: 140.97,
      saldoAnterior: 40,
      hoy: { cobrado: 168, igv: 25.63, comision: 1.4, pagado: 40, efectivoClaudia: 0, gastos: 0 },
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
    expect(titularDelCierre(cierre())).toEqual({ frase: "Se le debe a Claudia", monto: 140.97 });
    expect(titularDelCierre(cierre({ saldo: -2.4 }))).toEqual({ frase: "Claudia te debe", monto: 2.4 });
    expect(titularDelCierre(cierre({ saldo: 0 }))).toEqual({ frase: "Se le debe a Claudia", monto: 0 });
  });
  it("la línea de hoy dice cuánto y con qué medios; sin cobros lo dice", () => {
    expect(lineaDeHoy(cierre())).toBe("Hoy se cobró S/ 168.00 de CLAURE en tus cuentas (Tarjeta S/ 50.00 · Yape S/ 118.00), S/ 25.63 es IGV, que paga CAYLA, la comisión del POS es S/ 1.40.");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 0, devuelto: 0, igv: 0, comision: 0, pagado: 0, efectivoClaudia: 0, gastos: 0 }, porMedio: [] }))).toBe("Hoy no se cobró nada de CLAURE en tus cuentas.");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 100, devuelto: 30, igv: 0, comision: 0, pagado: 0, efectivoClaudia: 0, gastos: 0 } }))).toContain("se devolvió S/ 30.00");
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
        "• IGV de esas ventas (lo declara y paga CAYLA, se descuenta): S/ 25.63",
        "• Comisión del POS: S/ 1.40",
        "• Ya se te pagó hoy: S/ 40.00",
        "• Efectivo de CLAURE de hoy (lo tienes tú): S/ 150.00",
        "",
        "Saldo que te debemos: S/ 140.97",
      ].join("\n"),
    );
  });
  it("no pone renglones vacíos: sin comisión, devoluciones, pagos ni efectivo de CLAURE, solo lo cobrado y el saldo", () => {
    const m = mensajeParaClaudia(cierre({ hoy: { cobrado: 0, devuelto: 0, igv: 0, comision: 0, pagado: 0, efectivoClaudia: 0, gastos: 0 }, porMedio: [], efectivo: { total: 0, claure: 0, cayla: 0 } }));
    expect(m).not.toContain("Comisión");
    expect(m).not.toContain("IGV");
    expect(m).not.toContain("Devuelto");
    expect(m).not.toContain("Ya se te pagó");
    expect(m).not.toContain("Efectivo de CLAURE");
    expect(m).toContain("Saldo que te debemos: S/ 140.97");
  });
  it("si se le pagó de más, el saldo dice que queda a favor de CAYLA", () => {
    expect(mensajeParaClaudia(cierre({ saldo: -2.4 }))).toContain("Saldo: se te pagó de más, S/ 2.40 quedan a favor de CAYLA.");
  });
});

describe("los gastos de CLAURE que pagó CAYLA (ADR-0560, actividad 8)", () => {
  const conGastos = (gastos: number) => cierre({ hoy: { cobrado: 168, devuelto: 0, igv: 0, comision: 1.4, pagado: 0, efectivoClaudia: 0, gastos } });

  it("el cierre lee `hoy.gastos` de la base (0 si no viene: una base sin la migración)", () => {
    expect(leerCierreClaure({ hay_claure: true, hoy: { cobrado: 100, gastos: 708 } })?.hoy.gastos).toBe(708);
    expect(leerCierreClaure({ hay_claure: true, hoy: { cobrado: 100 } })?.hoy.gastos).toBe(0);
  });

  it("la línea de hoy dice cuánto se restó, y un día solo con gastos ya no dice que no pasó nada", () => {
    expect(lineaDeHoy(conGastos(708))).toContain("se restan S/\u00a0708.00 de gastos suyos que pagó CAYLA");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 0, devuelto: 0, igv: 0, comision: 0, pagado: 0, efectivoClaudia: 0, gastos: 118 }, porMedio: [] }))).toContain("se restan");
    expect(lineaDeHoy(conGastos(0))).not.toContain("gastos suyos");
  });

  it("el mensaje para Claudia los dice aparte", () => {
    expect(mensajeParaClaudia(conGastos(118))).toContain("• Gastos tuyos que pagó CAYLA hoy (se restan): S/\u00a0118.00");
    expect(mensajeParaClaudia(conGastos(0))).not.toContain("Gastos tuyos");
  });
});

describe("el efectivo que se queda con Claudia (actividad 11)", () => {
  const conEfectivo = (n: number) => cierre({ hoy: { cobrado: 168, devuelto: 0, igv: 25.63, comision: 1.4, pagado: 0, efectivoClaudia: n, gastos: 0 } });
  it("el cierre lo lee de la base (0 si no viene: una base sin la migración)", () => {
    expect(leerCierreClaure({ hay_claure: true, hoy: { cobrado: 100, efectivo_claudia: 100 } })?.hoy.efectivoClaudia).toBe(100);
    expect(leerCierreClaure({ hay_claure: true, hoy: { cobrado: 100 } })?.hoy.efectivoClaudia).toBe(0);
  });
  it("la línea de hoy y el mensaje para Claudia dicen cuánto efectivo se quedó, y un día solo con eso ya no dice que no pasó nada", () => {
    expect(lineaDeHoy(conEfectivo(100))).toContain("se restan S/\u00a0100.00 de efectivo de CAYLA que se quedó con ella");
    expect(mensajeParaClaudia(conEfectivo(100))).toContain("• Efectivo de CAYLA que te quedaste hoy (se resta): S/\u00a0100.00");
    expect(lineaDeHoy(cierre({ hoy: { cobrado: 0, devuelto: 0, igv: 0, comision: 0, pagado: 0, efectivoClaudia: 50, gastos: 0 }, porMedio: [] }))).toContain("se restan");
    expect(mensajeParaClaudia(conEfectivo(0))).not.toContain("te quedaste");
  });
  it("la vista previa del paso de trasladar dice cuánto se le debía y cuánto queda; con más de lo que se le debe, lo que ella le debe a CAYLA", () => {
    expect(vistaPreviaSeQueda(cierre({ saldo: 140.97 }), 100)).toMatchObject({ antes: 140.97, despues: 40.97 });
    expect(vistaPreviaSeQueda(cierre({ saldo: 140.97 }), 100)?.frase).toContain("quedan S/\u00a040.97");
    expect(vistaPreviaSeQueda(cierre({ saldo: 30 }), 100)?.frase).toContain("Claudia le debería S/\u00a070.00 a CAYLA");
    expect(vistaPreviaSeQueda(cierre(), 0)).toBeNull();
  });
});
