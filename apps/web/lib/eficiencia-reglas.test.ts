import { describe, expect, it } from "vitest";
import { eficienciaDePeriodo, etiquetaPeriodo, fechaLimaDe, repartoDelGasto, variacion, ventanasDePeriodos, type GastoTaller, type OrdenParaEficiencia, type PlanillaPeriodo } from "./eficiencia-reglas";

const planilla = (ini: string, fin: string, costo: number): PlanillaPeriodo => ({ periodoId: `p-${ini}`, ini, fin, personas: 5, pagado: costo * 0.85, provisiones: costo * 0.15, costoTotal: costo });
const orden = (id: string, extra: Partial<OrdenParaEficiencia> = {}): OrdenParaEficiencia => ({
  id,
  referencia: `Blusa ${id}`,
  estado: "terminada",
  esMuestra: false,
  cerradaEn: "2026-08-10",
  fechaEntrega: "2026-08-12",
  cantidadPlan: 50,
  cantidadBuenas: 48,
  costoTela: 800,
  costoAvios: 100,
  costoMaquila: 100,
  ...extra,
});
const V = { clave: "a", ini: "2026-07-29", fin: "2026-08-28", etiqueta: "29 jul – 28 ago", planilla: planilla("2026-07-29", "2026-08-28", 5000) };

describe("ventanasDePeriodos", () => {
  it("con planilla de Dynamic usa sus períodos (29 al 28), del más reciente al más viejo", () => {
    const v = ventanasDePeriodos([planilla("2026-06-28", "2026-07-28", 1), planilla("2026-07-29", "2026-08-28", 2)], "2026-09-21");
    expect(v.map((x) => x.ini)).toEqual(["2026-07-29", "2026-06-28"]);
    expect(v[0].etiqueta).toBe("29 jul – 28 ago");
    expect(v[0].planilla?.costoTotal).toBe(2);
  });
  it("sin planilla usa los últimos 3 meses calendario, sin planilla", () => {
    const v = ventanasDePeriodos([], "2026-09-21");
    expect(v.map((x) => [x.ini, x.fin])).toEqual([["2026-09-01", "2026-09-30"], ["2026-08-01", "2026-08-31"], ["2026-07-01", "2026-07-31"]]);
    expect(v.every((x) => x.planilla === null)).toBe(true);
  });
  it("etiquetas y fecha de Lima", () => {
    expect(etiquetaPeriodo("2026-06-28", "2026-07-28")).toBe("28 jun – 28 jul");
    expect(fechaLimaDe("2026-08-11T03:30:00Z")).toBe("2026-08-10"); // 22:30 del día 10 en Lima
    expect(fechaLimaDe(null)).toBeNull();
  });
});

describe("eficienciaDePeriodo", () => {
  it("costo por prenda = (materiales + maquila) ÷ buenas + (planilla + gastos) ÷ buenas", () => {
    const gastos: GastoTaller[] = [{ categoria: "alquiler", total: 800, fecha: "2026-08-05" }, { categoria: "servicios", total: 200, fecha: "2026-08-20" }, { categoria: "alquiler", total: 999, fecha: "2026-09-05" }];
    const e = eficienciaDePeriodo(V, [orden("a", { cantidadBuenas: 48 }), orden("b", { cantidadBuenas: 52, cantidadPlan: 52 })], gastos);
    expect(e.prendasBuenas).toBe(100);
    expect(e.calidad).toBeCloseTo(100 / 102, 5);
    expect(e.materiales).toBe(1800);
    expect(e.maquila).toBe(200);
    expect(e.gastos).toBe(1000);
    expect(e.gastosPorCategoria).toEqual([{ categoria: "alquiler", total: 800 }, { categoria: "servicios", total: 200 }]);
    expect(e.materialesPorPrenda).toBe(20); // 2000 / 100
    expect(e.conversionPorPrenda).toBe(60); // (5000 + 1000) / 100
    expect(e.costoPorPrenda).toBe(80);
    expect(e.gastadoTotal).toBe(8000);
  });
  it("solo cuenta lo cerrado en el período: no muestras, no en proceso, no fuera de fechas", () => {
    const e = eficienciaDePeriodo(
      V,
      [orden("a"), orden("m", { esMuestra: true }), orden("p", { estado: "en_proceso", cerradaEn: null }), orden("f", { cerradaEn: "2026-09-02" }), orden("x", { estado: "anulada" }), orden("z", { cantidadBuenas: 0 })],
      []
    );
    expect(e.ordenesCerradas).toBe(1);
    expect(e.prendasBuenas).toBe(48);
  });
  it("sin planilla visible NO inventa la conversión ni el costo por prenda, pero sí los materiales", () => {
    const e = eficienciaDePeriodo({ ...V, planilla: null }, [orden("a")], []);
    expect(e.planilla).toBeNull();
    expect(e.conversionPorPrenda).toBeNull();
    expect(e.costoPorPrenda).toBeNull();
    expect(e.materialesPorPrenda).toBeCloseTo(1000 / 48, 1);
  });
  it("sin prendas no hay costo por prenda", () => {
    const e = eficienciaDePeriodo(V, [], [{ categoria: "alquiler", total: 500, fecha: "2026-08-05" }]);
    expect(e.prendasBuenas).toBe(0);
    expect(e.costoPorPrenda).toBeNull();
    expect(e.calidad).toBeNull();
    expect(e.gastadoTotal).toBe(5500);
  });
  it("entregas: a tiempo, tarde o sin fecha", () => {
    const e = eficienciaDePeriodo(V, [orden("a", { cerradaEn: "2026-08-12", fechaEntrega: "2026-08-12" }), orden("b", { cerradaEn: "2026-08-15", fechaEntrega: "2026-08-12" }), orden("c", { fechaEntrega: null })], []);
    expect(e.entregas).toEqual({ aTiempo: 1, tarde: 1, sinFecha: 1 });
  });
});

describe("variacion y reparto del gasto", () => {
  it("cambio porcentual, y null si no hay base", () => {
    expect(variacion(110, 100)).toBeCloseTo(0.1, 5);
    expect(variacion(90, 100)).toBeCloseTo(-0.1, 5);
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(null, 100)).toBeNull();
  });
  it("el reparto suma 100 % y omite lo que no se gastó", () => {
    const e = eficienciaDePeriodo(V, [orden("a")], [{ categoria: "alquiler", total: 900, fecha: "2026-08-05" }]);
    const r = repartoDelGasto(e);
    expect(r.map((x) => x.clave)).toEqual(["planilla", "materiales", "maquila", "gastos"]);
    expect(r.reduce((s, x) => s + x.parte, 0)).toBeCloseTo(1, 5);
    expect(repartoDelGasto(eficienciaDePeriodo({ ...V, planilla: null }, [], []))).toEqual([]);
  });
});
