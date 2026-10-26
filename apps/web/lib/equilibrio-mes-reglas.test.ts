import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { equilibrioMes } from "./equilibrio-mes-reglas";
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
  const filas = r.resultadosMes.datos.map((f) => (f.unidad === "consolidado" ? { ...f, ventas: c.ventas, margen: c.margen, gastos: c.gastos, detalleGastos: c.detalleGastos ?? [] } : f));
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
  return equilibrioMes({ r, filas, ventasPorDia: ventas, hoy: HOY, mes: MES, enCurso: true, ...extra });
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
    expect(texto(x.detalle)).toBe("Desde ahí, cada S/ 100 que vendes te dejan S/ 50.");
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

describe("equilibrioMes · la meta, en las mismas unidades", () => {
  it("la meta por día de cada sede no se pone como la del mes: solo cubre hasta hoy y es de Rendimiento", () => {
    expect(ok(eq(A, dias(10, 4_720, 1_180))).meta).toBeNull();
  });

  it("la meta de ventas del mes del presupuesto (con IGV, como Caja) se pone sin IGV con la proporción del propio período", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 56_640 } as never] } };
    // 56,640 con IGV × (40,000 ÷ 47,200) = 48,000 sin IGV.
    const x = ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true }));
    expect(x.meta).toBeCloseTo(48_000, 0);
  });

  it("el camino es más largo que lo mayor de lo vendido, el equilibrio y la meta", () => {
    const { r, filas } = caso(A);
    const conMeta: ResumenFinanzas = { ...r, presupuesto: { estado: "ok", datos: [{ linea: "ventas", unidad: "consolidado", ubicacionId: null, presupuesto: 56_640 } as never] } };
    const x = ok(equilibrioMes({ r: conMeta, filas, ventasPorDia: dias(10, 4_720), hoy: HOY, mes: MES, enCurso: true }));
    expect(x.tope).toBeGreaterThan(Math.max(x.vendido, x.pe, x.meta ?? 0));
  });
});
