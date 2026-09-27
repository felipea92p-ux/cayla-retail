import { describe, it, expect } from "vitest";
import { cuantosPorTipo, diasDelMes, montosPorTramo } from "./comprobantes-graficos-reglas";

const c = (o: Partial<{ tipo: "boleta" | "factura" | "nota_credito"; estado: string; total: number; created_at: string; entorno_transmision: "sandbox" | "produccion" | null }>) =>
  ({ tipo: "boleta", estado: "aceptado", total: 10, created_at: "2026-09-26T15:10:00Z", entorno_transmision: "produccion", anulacion_solicitada_at: null, ...o }) as never;

describe("cuantosPorTipo", () => {
  it("cuenta boletas, facturas y notas, sin anulados ni liberados", () => {
    expect(cuantosPorTipo([c({}), c({ tipo: "factura" }), c({ tipo: "nota_credito" }), c({ estado: "anulado" }), c({ estado: "no_emitido" })])).toEqual({ boletas: 1, facturas: 1, notas: 1 });
  });
});

describe("montosPorTramo", () => {
  it("por hora de Lima: 15:10Z son las 10 h", () => {
    const t = montosPorTramo([c({ total: 50 })], "hora");
    expect(t.find((x) => x.etiqueta === "10 h")?.facturado).toBe(50);
  });

  it("lo de prueba o sin enviar va al resto, no a lo facturado", () => {
    const t = montosPorTramo([c({ entorno_transmision: "sandbox", total: 30 }), c({ estado: "pendiente", entorno_transmision: null, total: 20 })], "hora");
    const diez = t.find((x) => x.etiqueta === "10 h")!;
    expect(diez).toEqual({ etiqueta: "10 h", facturado: 0, resto: 50 });
  });

  it("la nota de crédito resta en su tramo, y lo facturado suma lo mismo que la tarjeta", () => {
    const t = montosPorTramo([c({ total: 100 }), c({ tipo: "nota_credito", total: 40 })], "hora");
    expect(t.reduce((s, x) => s + x.facturado, 0)).toBe(60);
  });

  it("por día del mes, en hora de Lima: el 1 a las 02:00Z todavía es el último día del mes anterior y cae en el primer tramo", () => {
    const t = montosPorTramo([c({ created_at: "2026-09-02T02:00:00Z", total: 5 })], "dia", { diasDelMes: 30 });
    expect(t).toHaveLength(30);
    expect(t[0].facturado).toBe(5);
  });

  it("anulados y liberados no se dibujan", () => {
    const t = montosPorTramo([c({ estado: "anulado" }), c({ estado: "no_emitido" })], "hora");
    expect(t.every((x) => x.facturado === 0 && x.resto === 0)).toBe(true);
  });
});

describe("diasDelMes", () => {
  it("setiembre tiene 30 y febrero de 2028, 29", () => {
    expect(diasDelMes(2026, 9)).toBe(30);
    expect(diasDelMes(2028, 2)).toBe(29);
  });
});
