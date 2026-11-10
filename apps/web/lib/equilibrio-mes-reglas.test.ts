import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { equilibrioMes, notaDeLoQueFaltaDelMes, ventaParaElMesEntero } from "./equilibrio-mes-reglas";
import type { FilaER } from "./resultados-reglas";
import { leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { DiaVenta } from "./resumen-telar-reglas";

// «¿Ya pagaste el mes?» (Resumen, spike 4): cuánto hay que vender para pagar TODO el mes y desde qué día se pagó.

const HOY = "2026-10-10";
const MES = "2026-10";
const texto = (s: string) => s.replace(/ /g, " ");

/** El Resumen de CAYLA con el consolidado puesto a mano: ventas sin IGV, margen (ventas − ropa) y gastos del mes. */
function caso(c: { ventas: number; margen: number; gastos: number; detalleGastos?: FilaER["detalleGastos"] }, tipo: "todas" | "taller" | "empresa" = "todas") {
  const r = leerResumen(fixture.todas);
  if (r.resultadosMes.estado !== "ok") throw new Error("fixture");
  const filas = r.resultadosMes.datos.map((f) => (f.unidad === "consolidado" ? { ...f, ventas: c.ventas, margen: c.margen, gastos: c.gastos, depreciacion: 0, detalleGastos: c.detalleGastos ?? [] } : f));
  const ver: ResumenFinanzas["ver"] =
    tipo === "todas" ? { ...r.ver, todas: true, tipo: "todas", soloEmpresa: false }
    : tipo === "taller" ? { ...r.ver, todas: false, tipo: "taller", soloEmpresa: false, ubicacionId: "tal" }
    : { ...r.ver, todas: false, tipo: "empresa", soloEmpresa: true, ubicacionId: null };
  return { r: { ...r, ver }, filas };
}
/** `dias` días de venta, cada uno con `diario` CON IGV (y, si se pide, la meta de la sede de ese día). */
function dias(n: number, diario: number, metaSede: number | null = null): { series: DiaVenta[][]; incompleta: boolean } {
  return { series: [[...Array(n)].map((_, i) => ({ fecha: `${MES}-${String(i + 1).padStart(2, "0")}`, total: diario, metaSede }))], incompleta: false };
}
const eq = (c: Parameters<typeof caso>[0], ventas = dias(10, 4_720), extra: Partial<Parameters<typeof equilibrioMes>[0]> = {}, tipo: "todas" | "taller" | "empresa" = "todas") => {
  const { r, filas } = caso(c, tipo);
  return equilibrioMes({ r, filas, ventasPorDia: ventas, hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [], ...extra });
};
function ok(x: ReturnType<typeof eq>) {
  if (x.tipo !== "ok") throw new Error(`se esperaba «ok» y salió ${x.tipo}`);
  return x;
}

// 40,000 vendidos sin IGV, 50 % de margen y 12,000 de gastos → hay que vender 24,000.
const A = { ventas: 40_000, margen: 20_000, gastos: 12_000 };

describe("equilibrioMes · ya se pagó el mes", () => {
  it("dice el día en que lo vendido llegó al equilibrio, con la venta real día por día", () => {
    const x = ok(eq(A));
    expect(x.pe).toBe(24_000);
    expect(x.estado).toBe("cubierto");
    // 4,720 con IGV por día = 4,000 sin IGV: 6 días × 4,000 = 24,000.
    expect(x.diaCubierto).toBe(6);
    expect(x.titular).toBe("El día 6 ya habías pagado todo lo de octubre.");
    expect(texto(x.detalle)).toBe("Desde ahí, cada S/ 100 sin IGV que vendes te dejan S/ 50.");
  });

  it("en un mes que ya cerró habla en pasado", () => {
    const x = ok(eq(A, dias(10, 4_720), { enCurso: false }));
    expect(x.titular).toBe("Desde el día 6 ya se había pagado todo lo de octubre.");
  });

  it("sin la venta día por día (la cuenta no ve Rendimiento) no inventa el día, pero sí dice que ya se pagó", () => {
    const x = ok(eq(A, null as never));
    expect(x.diaCubierto).toBeNull();
    expect(texto(x.titular)).toBe("Ya pagaste todo lo de octubre: llevas S/ 40,000 y hacían falta S/ 24,000.");
  });

  it("si falta una tienda en el día por día (sumas incompletas) tampoco inventa el día", () => {
    const x = ok(eq(A, { ...dias(10, 4_720), incompleta: true }));
    expect(x.diaCubierto).toBeNull();
  });
});

describe("equilibrioMes · todavía falta", () => {
  it("a este ritmo todavía llega este mes: dice el día", () => {
    const x = ok(eq({ ventas: 10_000, margen: 5_000, gastos: 12_000 }, dias(10, 1_180)));
    expect(x.estado).toBe("en_camino");
    expect(x.ritmoPorDia).toBe(1_000);
    expect(x.diaLlegada).toBe(24);
    expect(texto(x.titular)).toBe("Te faltan S/ 14,000 vendidos para pagar todo lo de octubre.");
    expect(texto(x.detalle)).toBe("Con lo que vendes al día (S/ 1,000), lo pagas el día 24.");
  });

  it("a este ritmo no llega: dice cuánto faltaría al cerrar", () => {
    const x = ok(eq({ ventas: 5_000, margen: 2_500, gastos: 12_000 }, dias(10, 590)));
    expect(x.estado).toBe("no_llega");
    expect(x.diaLlegada).toBeNull();
    expect(x.cierre).toBe(15_500);
    expect(texto(x.titular)).toBe("A este ritmo no alcanzas a pagar todo lo de octubre.");
    expect(texto(x.detalle)).toBe("Cerrarías con S/ 15,500 y hacen falta S/ 24,000: te faltarían S/ 8,500.");
  });

  it("un mes cerrado que no alcanzó lo dice en pasado, sin proyectar", () => {
    const x = ok(eq({ ventas: 5_000, margen: 2_500, gastos: 12_000 }, dias(10, 590), { enCurso: false, hoy: "2026-11-05" }));
    expect(texto(x.titular)).toBe("Octubre no alcanzó a pagar todo lo suyo.");
    expect(texto(x.detalle)).toBe("Se vendió S/ 5,000 y hacían falta S/ 24,000: faltaron S/ 19,000.");
  });
});

describe("equilibrioMes · lo que NO se calcula", () => {
  it("sin gastos registrados no dibuja un equilibrio falso: lo dice y manda a cargarlos", () => {
    const x = eq({ ventas: 40_000, margen: 20_000, gastos: 0 });
    expect(x.tipo).toBe("sin_calculo");
    expect(x.tipo === "sin_calculo" && x.motivo).toContain("Cárgalos en Gastos");
  });

  it("un sobrante de caja no cuenta como gasto registrado (no vuelve «sano» a quien no cargó nada)", () => {
    const x = eq({ ventas: 40_000, margen: 20_000, gastos: -140, detalleGastos: [{ cuenta: "6599", nombre: "Diferencias de caja", monto: -140 }] as never });
    expect(x.tipo).toBe("sin_calculo");
  });

  it("sin ventas o sin margen no hay con qué calcular", () => {
    expect(eq({ ventas: 0, margen: 0, gastos: 12_000 }).tipo).toBe("sin_calculo");
    const m = eq({ ventas: 40_000, margen: 0, gastos: 12_000 });
    expect(m.tipo === "sin_calculo" && m.motivo).toContain("no deja margen");
  });

  it("el Taller y la Empresa no venden: no hay equilibrio, y dice de dónde se pagan", () => {
    expect(eq(A, dias(10, 4_720), {}, "taller")).toMatchObject({ tipo: "no_vende" });
    expect(eq(A, dias(10, 4_720), {}, "empresa")).toMatchObject({ tipo: "no_vende" });
  });
});

describe("equilibrioMes · un mes anterior al inicio de Finanzas", () => {
  it("no dice que no hubo movimientos", () => {
    const { r } = caso(A);
    const x = equilibrioMes({ r, filas: [], ventasPorDia: null, hoy: HOY, mes: "2026-09", enCurso: false, faltaDelMes: null, inicioFinanzas: "2026-10-01" });
    expect(x).toEqual({ tipo: "sin_calculo", motivo: "Finanzas empezó a contar en octubre: este mes no se mide." });
  });
});

describe("equilibrioMes · la meta, en las mismas unidades", () => {
  it("la meta por día de cada sede no se pone como la del mes: sin presupuesto no hay marca", () => {
    const { r, filas } = caso(A);
    const sinPpto: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [] } };
    expect(ok(equilibrioMes({ r: sinPpto, filas, ventasPorDia: dias(10, 4_720, 1_180), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] })).meta).toBeNull();
  });

  it("la meta de ventas del mes del presupuesto ya viene sin IGV (`fn_presupuesto_vs_real`): se toma tal cual", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 56_640 } as never] } };
    const x = ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] }));
    expect(x.meta).toBe(56_640);
  });

  it("sin la venta por día (CAYLA Global no ve Rendimiento) tampoco se descuenta el IGV otra vez", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 100_000 } as never] } };
    expect(ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: null, hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] })).meta).toBe(100_000);
  });

  it("sin la venta por día y con el IGV leído, la meta vuelve a la que se escribió: nunca dividida dos veces", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 100_000 } as never] } };
    const conIgv = filas.map((f) => (f.unidad === "consolidado" ? { ...f, igvCobrado: f.ventas * 0.1807, claureSinIgv: 0 } : f));
    expect(ok(equilibrioMes({ r: conMeta, filas: conIgv, ventasPorDia: null, hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] })).meta).toBe(118_000);
  });

  it("parado en una sede con metas por día, la marca del presupuesto del mes sigue saliendo", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 80_000 } as never] } };
    expect(ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720, 1_180), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] })).meta).toBe(80_000);
  });

  it("un mes que ya pasó no lleva la marca", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 56_640 } as never] } };
    expect(ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720), hoy: "2026-11-05", mes: MES, enCurso: false, faltaDelMes: null })).meta).toBeNull();
  });

  it("el camino es más largo que lo mayor de lo vendido, el equilibrio y la meta", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 56_640 } as never] } };
    const x = ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] }));
    expect(x.tope).toBeGreaterThan(Math.max(x.vendido, x.pe, x.meta ?? 0));
  });
});

describe("equilibrioMes · contra el mes entero (tarea 24)", () => {
  const FALTA = [{ ubicacionId: "u-tru", fijos: 3_000, depreciacion: 500 }];
  it("el día 5 y el día 28 dan casi el mismo equilibrio: lo que falta del mes cuenta desde el principio", () => {
    // El día 5: 2,000 registrados + lo que falta. El día 28: ya están registrados los mismos 5,500 y no falta nada.
    const dia5 = ok(eq({ ...A, gastos: 2_000 }, dias(5, 4_720), { hoy: "2026-10-05", faltaDelMes: FALTA }));
    const dia28 = ok(eq({ ...A, gastos: 5_500 }, dias(10, 4_720), { hoy: "2026-10-28", faltaDelMes: [] }));
    expect(dia5.pe).toBe(dia28.pe);
    expect(dia5.pe).toBe(11_000);
  });
  it("sin contar lo que falta diría «Pagado»; contándolo, todavía no", () => {
    const sinContar = ok(eq({ ventas: 5_000, margen: 2_500, gastos: 1_000 }, dias(2, 2_950), { hoy: "2026-10-02" }));
    expect(sinContar.estado).toBe("cubierto");
    const contando = ok(eq({ ventas: 5_000, margen: 2_500, gastos: 1_000 }, dias(2, 2_950), { hoy: "2026-10-02", faltaDelMes: FALTA }));
    expect(contando.estado).not.toBe("cubierto");
    expect(contando.pe).toBe(9_000);
  });
  it("mirando una sede solo cuenta lo de esa sede; la empresa, lo que no tiene sede", () => {
    const { r, filas } = caso(A);
    const una = (ver: Partial<ResumenFinanzas["ver"]>) => {
      const v = { ...r.ver, todas: false, tipo: "tienda", soloEmpresa: false, ...ver } as ResumenFinanzas["ver"];
      const fs = filas.map((f) => (f.unidad === "consolidado" ? { ...f, ubicacionId: "u-tru", unidad: "tienda" as const } : f));
      return equilibrioMes({ r: { ...r, ver: { ...v, ubicacionId: "u-tru" } }, filas: fs, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [...FALTA, { ubicacionId: "u-lim", fijos: 9_000, depreciacion: 0 }] });
    };
    expect(ok(una({})).pe).toBe(31_000);
  });
  it("la depreciación no se suma dos veces cuando el último día ya se asentó", () => {
    const { r, filas } = caso(A);
    const fs = filas.map((f) => (f.unidad === "consolidado" ? { ...f, depreciacion: 500, gastos: 12_500 } : f));
    const x = ok(equilibrioMes({ r, filas: fs, ventasPorDia: dias(10, 4_720), hoy: "2026-10-31", mes: MES, enCurso: true, faltaDelMes: FALTA }));
    expect(x.pe).toBe(31_000);
  });
  it("la planilla que falta devengar cuenta, y un mes que ya pasó no suma nada", () => {
    const { r, filas } = caso(A);
    const fs = filas.map((f) => (f.unidad === "consolidado" ? { ...f, planillaEstimada: 1_000, planillaAlCierre: 3_000 } : f));
    expect(ok(equilibrioMes({ r, filas: fs, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] })).pe).toBe(28_000);
    expect(ok(equilibrioMes({ r, filas: fs, ventasPorDia: dias(10, 4_720), hoy: "2026-11-05", mes: MES, enCurso: false, faltaDelMes: FALTA })).pe).toBe(24_000);
  });
  it("sin poder leer lo que falta no dice «Pagado»: dice que está por confirmar", () => {
    const x = ok(eq(A, dias(10, 4_720), { faltaDelMes: null }));
    expect(x.estado).toBe("sin_confirmar");
    expect(x.titular).not.toContain("pagado");
    expect(x.detalle).toContain("No se pudo leer");
  });
});

describe("ventaParaElMesEntero (ADR-0621)", () => {
  const tienda = { unidad: "tienda", ubicacionId: "u-tru", ventas: 10_000, margen: 5_000, gastos: 2_000, planillaAlCierre: 4_000, planillaEstimada: 1_000, depreciacion: 0 } as FilaER;
  it("suma la planilla y los fijos que faltan: pide el mes, no los días que van", () => {
    expect(ventaParaElMesEntero(tienda, [{ ubicacionId: "u-tru", fijos: 3_000, depreciacion: 0 }, { ubicacionId: "otra", fijos: 9_000, depreciacion: 0 }])).toBe(16_000);
  });
  it("sin poder leer lo que falta no da cifra", () => {
    expect(ventaParaElMesEntero(tienda, null)).toBeNull();
  });
});

// Tarea 19: se calcula sin IGV y se muestra con IGV. Cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609).
describe("equilibrioMes · lo que se dice va con IGV", () => {
  const TRUJILLO = { unidad: "tienda", ubicacionId: "u", nombre: "Tienda TRU", ventas: 75_000, margen: 25_200, gastos: 30_000, resultado: -4_800, depreciacion: 0, planillaAlCierre: 0, planillaEstimada: 0, detalleGastos: [] } as unknown as FilaER;
  const CON_IGV = { igvCobrado: 13_500, claureSinIgv: 0 };
  const LIMA = { ...TRUJILLO, ventas: 1_000, margen: 500, gastos: 1_000, resultado: -500 } as FilaER;
  const LIMA_IGV = { igvCobrado: 270, claureSinIgv: 500 };
  const enTienda = (f: FilaER) => {
    const r = leerResumen(fixture.todas);
    return ok(equilibrioMes({ r: { ...r, ver: { ...r.ver, todas: false, tipo: "tienda", soloEmpresa: false, ubicacionId: "u" } }, filas: [f], ventasPorDia: null, hoy: "2026-11-09", mes: MES, enCurso: false, faltaDelMes: [] }));
  };

  it("Trujillo: dice unos S/ 105,400 junto a S/ 88,500 y el margen sigue en 33.6 %", () => {
    const x = enTienda({ ...TRUJILLO, ...CON_IGV });
    expect(x.vendido).toBe(88_500);
    expect(Math.ceil(x.pe / 100) * 100).toBe(105_400);
    expect(x.rotulo).toBe("con IGV");
    expect(((TRUJILLO.margen / TRUJILLO.ventas) * 100).toFixed(1)).toBe("33.6");
    expect(x.margenPor100).toBe(34);
    expect(texto(x.detalle)).toContain("S/ 88,500 y hacían falta S/ 105,");
  });
  it("con IGV no cambia ni el estado ni la barra", () => {
    const con = enTienda({ ...TRUJILLO, ...CON_IGV });
    const sin = enTienda(TRUJILLO);
    expect(con.estado).toBe(sin.estado);
    expect(con.margenPor100).toBe(sin.margenPor100);
    expect(con.vendido / con.tope).toBeCloseTo(sin.vendido / sin.tope, 5);
    expect(con.pe / con.tope).toBeCloseTo(sin.pe / sin.tope, 5);
  });
  it("Tienda LIM: lo de CAYLA con IGV, ni lo cobrado en la tienda ni una tasa inflada", () => {
    const x = enTienda({ ...LIMA, ...LIMA_IGV });
    const sin = enTienda(LIMA);
    expect(x.vendido).toBe(1_180);
    expect(x.pe / sin.pe).toBeCloseTo(1.18, 3);
    expect(x.rotulo).toBe("con IGV y sin lo de CLAURE");
  });
  it("sin poder leer el IGV queda sin convertir y lo dice", () => {
    const x = enTienda(TRUJILLO);
    expect(x.vendido).toBe(75_000);
    expect(x.rotulo).toBe("sin IGV");
  });
  it("el ritmo, el cierre y la meta llevan el mismo factor", () => {
    const { r, filas } = caso({ ventas: 10_000, margen: 5_000, gastos: 12_000 });
    const conIgv = filas.map((f) => (f.unidad === "consolidado" ? { ...f, igvCobrado: 1_800, claureSinIgv: 0 } : f));
    const base = { r, ventasPorDia: dias(10, 1_180), hoy: HOY, mes: MES, enCurso: true, faltaDelMes: [] };
    const x = ok(equilibrioMes({ ...base, filas: conIgv }));
    const y = ok(equilibrioMes({ ...base, filas }));
    expect(y.meta).not.toBeNull();
    expect(x.meta! / y.meta!).toBeCloseTo(1.18, 3);
    expect(x.ritmoPorDia).toBeCloseTo(y.ritmoPorDia * 1.18, 1);
    expect(x.cierre).toBeCloseTo(y.cierre * 1.18, 1);
  });
  it("«cuánto hay que vender» del mes entero se convierte antes de redondear", () => {
    const tienda = { unidad: "tienda", ubicacionId: "u-tru", ventas: 10_000, margen: 4_000, gastos: 2_000, planillaAlCierre: 4_000, planillaEstimada: 1_000, depreciacion: 0 } as FilaER;
    const falta = [{ ubicacionId: "u-tru", fijos: 3_100, depreciacion: 0 }];
    expect(ventaParaElMesEntero(tienda, falta)).toBe(20_300);
    // 20,250 × 1.18 = 23,895 → 23,900; redondeando antes (20,300 × 1.18) saldrían 23,954.
    expect(ventaParaElMesEntero({ ...tienda, igvCobrado: 1_800, claureSinIgv: 0 }, falta)).toBe(23_900);
  });
});

describe("notaDeLoQueFaltaDelMes (tarea 150)", () => {
  const CAYLA = { unidad: "consolidado", ubicacionId: null, depreciacion: 0 } as FilaER;
  const LIMA = { unidad: "tienda", ubicacionId: "u-lim", depreciacion: 0 } as FilaER;
  const EMPRESA = { unidad: "empresa", ubicacionId: null, depreciacion: 0 } as FilaER;
  const FALTA = [
    { ubicacionId: "u-lim", fijos: 1_000, depreciacion: 300 },
    { ubicacionId: "u-tru", fijos: 13_000, depreciacion: 600 },
    { ubicacionId: null, fijos: 0, depreciacion: 0 },
  ];
  it("con CAYLA entera dice los dos montos que aún no están", () => {
    expect(texto(notaDeLoQueFaltaDelMes(CAYLA, FALTA)!)).toBe("Este mes todavía no incluye S/ 900 de desgaste de los equipos (se resta el último día) ni S/ 14,000 de gastos fijos sin registrar.");
  });
  it("con una sede, solo lo suyo; cambia al elegir otra", () => {
    expect(texto(notaDeLoQueFaltaDelMes(LIMA, FALTA)!)).toBe("Este mes todavía no incluye S/ 300 de desgaste de los equipos (se resta el último día) ni S/ 1,000 de gastos fijos sin registrar.");
  });
  it("lo que no falta no se nombra", () => {
    expect(texto(notaDeLoQueFaltaDelMes(LIMA, [{ ubicacionId: "u-lim", fijos: 1_000, depreciacion: 0 }])!)).toBe("Este mes todavía no incluye S/ 1,000 de gastos fijos sin registrar.");
    expect(texto(notaDeLoQueFaltaDelMes(LIMA, [{ ubicacionId: "u-lim", fijos: 0, depreciacion: 300 }])!)).toBe("Este mes todavía no incluye S/ 300 de desgaste de los equipos (se resta el último día).");
    expect(notaDeLoQueFaltaDelMes(EMPRESA, FALTA)).toBeNull();
  });
  it("el último día del mes, con el desgaste ya restado, no sale", () => {
    expect(notaDeLoQueFaltaDelMes({ ...CAYLA, depreciacion: 900 }, FALTA)).toBeNull();
  });
  it("sin el dato (mes que ya pasó, fechas sueltas o lectura caída), no sale", () => {
    expect(notaDeLoQueFaltaDelMes(CAYLA, null)).toBeNull();
  });
});
