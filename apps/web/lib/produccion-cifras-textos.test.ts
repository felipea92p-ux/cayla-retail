import { describe, expect, it } from "vitest";
import type { CifrasResumen } from "./produccion-decisiones";
import { SEMANAS_DE_HISTORIA_CORTA, notaDeHistoria, textosDeCifras } from "./produccion-cifras-textos";

const cifras = (extra: Partial<CifrasResumen> = {}): CifrasResumen => ({
  capitalInsumos: 3000,
  insumosBajoMinimo: 0,
  valorEnProceso: 1150,
  ordenesEnProceso: 3,
  porPagar: 1680,
  vencido: 0,
  entregasEnRiesgo: 0,
  insumosCargados: 5,
  ordenesSinCosto: 0,
  facturasCargadas: 4,
  ordenesSinFecha: 0,
  ...extra,
});

describe("las cuatro cifras de arriba dicen la verdad (Formidable, Producción ▸ Resumen)", () => {
  it("con todo cargado, dicen lo de siempre", () => {
    const t = textosDeCifras(cifras());
    expect(t.capital).toEqual({ sinDato: false, contexto: "a costo de cada lote" });
    expect(t.valorEnProceso).toEqual({ sinDato: false, contexto: "tela y avíos de 3 órdenes abiertas" });
    expect(t.porPagar).toEqual({ sinDato: false, contexto: "nada vencido" });
    expect(t.entregas).toEqual({ sinDato: false, contexto: "ninguna vencida ni por vencer" });
  });

  it("sin insumos cargados, el capital no es «S/ 0.00»: es «aún no hay» y dice qué hacer", () => {
    const t = textosDeCifras(cifras({ insumosCargados: 0, capitalInsumos: 0 }));
    expect(t.capital.sinDato).toBe(true);
    expect(t.capital.contexto).toContain("Cárgalos en Insumos");
  });

  it("con insumos pero sin costo en los lotes, también es «sin dato»", () => {
    expect(textosDeCifras(cifras({ capitalInsumos: null })).capital).toEqual({ sinDato: true, contexto: "Los insumos todavía no tienen costo cargado." });
  });

  it("con insumos bajo el mínimo, lo dice (y sigue siendo un dato)", () => {
    expect(textosDeCifras(cifras({ insumosBajoMinimo: 2 })).capital).toEqual({ sinDato: false, contexto: "2 insumos bajo el mínimo" });
  });

  it("órdenes abiertas sin costo: el valor en proceso no es 0, es «todavía sin costo»", () => {
    const t = textosDeCifras(cifras({ valorEnProceso: 0, ordenesEnProceso: 4, ordenesSinCosto: 1 }));
    expect(t.valorEnProceso).toEqual({ sinDato: true, contexto: "1 orden abierta todavía sin costo de tela ni avíos." });
    expect(textosDeCifras(cifras({ valorEnProceso: 0, ordenesEnProceso: 4, ordenesSinCosto: 3 })).valorEnProceso.contexto).toBe("3 órdenes abiertas todavía sin costo de tela ni avíos.");
  });

  it("si algunas órdenes tienen costo y otras no, el número se queda y se avisa cuántas faltan", () => {
    expect(textosDeCifras(cifras({ ordenesSinCosto: 1 })).valorEnProceso).toEqual({ sinDato: false, contexto: "tela y avíos de 3 órdenes abiertas · 1 sin costo cargado" });
  });

  it("sin órdenes abiertas, un 0 es un 0 de verdad", () => {
    expect(textosDeCifras(cifras({ ordenesEnProceso: 0, valorEnProceso: 0 })).valorEnProceso).toEqual({ sinDato: false, contexto: "no hay órdenes abiertas" });
  });

  it("sin facturas cargadas, «no se debe nada» sería afirmar lo que no se sabe", () => {
    const t = textosDeCifras(cifras({ facturasCargadas: 0, porPagar: 0 }));
    expect(t.porPagar).toEqual({ sinDato: true, contexto: "Aún no hay facturas de proveedores cargadas." });
  });

  it("con facturas: vencido, por pagar sin vencer, o no se debe nada", () => {
    expect(textosDeCifras(cifras({ vencido: 500 })).porPagar.contexto).toContain("ya vencidos");
    expect(textosDeCifras(cifras({ porPagar: 1200 })).porPagar.contexto).toBe("nada vencido");
    expect(textosDeCifras(cifras({ porPagar: 0 })).porPagar.contexto).toBe("no se debe nada");
  });

  it("entregas: si NINGUNA orden tiene fecha, no hay un «0» que mostrar: es «sin dato» y dice qué hacer", () => {
    expect(textosDeCifras(cifras({ ordenesEnProceso: 4, ordenesSinFecha: 4 })).entregas).toEqual({ sinDato: true, contexto: "4 órdenes abiertas no tienen fecha de entrega. Ponles fecha y te avisamos si se atrasan." });
    expect(textosDeCifras(cifras({ ordenesEnProceso: 1, ordenesSinFecha: 1 })).entregas.contexto).toContain("1 orden abierta no tiene fecha");
  });
  it("entregas: si algunas tienen fecha y otras no, el 0 es un dato y se dice cuántas faltan", () => {
    expect(textosDeCifras(cifras({ ordenesEnProceso: 4, ordenesSinFecha: 2 })).entregas).toEqual({ sinDato: false, contexto: "ninguna vencida · 2 órdenes sin fecha de entrega" });
    expect(textosDeCifras(cifras({ ordenesEnProceso: 4, ordenesSinFecha: 1 })).entregas.contexto).toBe("ninguna vencida · 1 orden sin fecha de entrega");
  });
  it("entregas: con alguna vencida o por vencer, lo dice aunque falten fechas", () => {
    expect(textosDeCifras(cifras({ entregasEnRiesgo: 2, ordenesEnProceso: 4, ordenesSinFecha: 4 })).entregas).toEqual({ sinDato: false, contexto: "vencidas o por vencer en 2 días" });
  });
});

describe("la edad de los datos: una nota mientras el sistema lleva poco midiendo ventas", () => {
  it("a las 4 semanas dice «4 semanas» y desde cuándo", () => {
    expect(notaDeHistoria("2026-10-27")).toBe("El sistema lleva 4 semanas de ventas (desde el 29 de setiembre): las cantidades son una guía, no una orden.");
  });
  it("la primera semana dice «menos de una semana»; una sola semana, en singular", () => {
    expect(notaDeHistoria("2026-10-02")).toContain("menos de una semana");
    expect(notaDeHistoria("2026-10-06")).toContain("1 semana de ventas");
  });
  it("se apaga sola al llegar al tope", () => {
    expect(notaDeHistoria("2026-11-23")).not.toBeNull(); // 55 días = 7 semanas
    expect(notaDeHistoria("2026-11-24")).toBeNull(); // 56 días = 8 semanas = SEMANAS_DE_HISTORIA_CORTA
    expect(SEMANAS_DE_HISTORIA_CORTA).toBe(8);
  });
  it("una fecha anterior al arranque no inventa semanas", () => {
    expect(notaDeHistoria("2026-09-01")).toBeNull();
  });
});
