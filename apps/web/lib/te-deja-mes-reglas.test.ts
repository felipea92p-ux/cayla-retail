import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { anchoDelRango, teDejaDelMes } from "./te-deja-mes-reglas";
import { equilibrioMes } from "./equilibrio-mes-reglas";
import type { FilaER } from "./resultados-reglas";
import { leerResumen } from "./resumen-finanzas-reglas";

// «Noviembre va así» (camino A, Felipe 2026-11-09): lo que te deja el mes, estimado con rango mientras corre.

const r = leerResumen(fixture.todas);
if (r.resultadosMes.estado !== "ok") throw new Error("fixture");
const base = r.resultadosMes.datos.find((f) => f.unidad === "consolidado")!;
const VER = { todas: true, soloEmpresa: false, ubicacionId: null };

/** El consolidado de un mes de 30 días: ventas sin IGV, margen, gastos registrados y lo que deja hasta hoy. */
function fila(c: { ventas: number; margen: number; gastos: number }): FilaER {
  return { ...base, ventas: c.ventas, margen: c.margen, gastos: c.gastos, resultado: c.margen - c.gastos, depreciacion: 0, planillaAlCierre: 0, planillaEstimada: 0 };
}

// Día 10 de noviembre (30 días): 40,000 vendidos, 50 % de margen, 12,000 de gastos registrados y 6,000 de fijos que faltan.
const F = fila({ ventas: 40_000, margen: 20_000, gastos: 12_000 });
const FALTA = [{ ubicacionId: null, fijos: 6_000, depreciacion: 0 }];

describe("teDejaDelMes · el mes en curso", () => {
  const x = teDejaDelMes({ f: F, ver: VER, mes: "2026-11", hoy: "2026-11-10", unMes: true, faltaDelMes: FALTA });
  if (x.tipo !== "estimado") throw new Error(`se esperaba un estimado y salió ${x.tipo}`);

  it("suma el margen de lo que falta vender al ritmo de hoy y resta los gastos que faltan", () => {
    // Hasta hoy: 8,000. Faltan 20 días × 4,000 = 80,000 vendidos → 40,000 de margen. Menos 6,000 de fijos: 42,000.
    expect(x.hastaHoy).toBe(8_000);
    expect(x.faltaVender).toBe(80_000);
    expect(x.faltaGastar).toBe(6_000);
    expect(x.estimado).toBe(42_000);
  });

  it("dice lo mismo que «¿Ya pagaste el mes?»: el estimado es el margen de lo que se vende sobre el equilibrio", () => {
    const eq = equilibrioMes({ r: { ...r, ver: { ...r.ver, todas: true, tipo: "todas", soloEmpresa: false } }, filas: [F], ventasPorDia: null, hoy: "2026-11-10", mes: "2026-11", enCurso: true, faltaDelMes: FALTA });
    if (eq.tipo !== "ok") throw new Error();
    // Cierre al ritmo: 120,000; equilibrio: 18,000 ÷ 50 % = 36,000. (120,000 − 36,000) × 50 % = 42,000.
    expect(Math.round((eq.cierre - eq.pe) * 0.5)).toBe(x.estimado);
  });

  it("el rango va sobre lo que falta vender y contiene al estimado", () => {
    expect(x.rango[0]).toBeLessThan(x.estimado);
    expect(x.rango[1]).toBeGreaterThan(x.estimado);
    // Día 10 de 30: ±(4 % + 16 % × 2/3) de los 40,000 de margen que faltan.
    expect(x.rango[1] - x.estimado).toBeCloseTo(40_000 * (0.04 + 0.16 * (20 / 30)), 0);
  });
});

describe("teDejaDelMes · los bordes", () => {
  it("el rango se angosta a medida que pasan los días", () => {
    expect(anchoDelRango(1, 30)).toBeGreaterThan(anchoDelRango(15, 30));
    expect(anchoDelRango(15, 30)).toBeGreaterThan(anchoDelRango(30, 30));
    expect(anchoDelRango(30, 30)).toBeCloseTo(0.04);
    expect(anchoDelRango(0, 30)).toBeCloseTo(0.2);
  });

  it("un mes cerrado es lo que fue: sin rango, con cuánto dejó de cada S/ 100", () => {
    expect(teDejaDelMes({ f: F, ver: VER, mes: "2026-10", hoy: "2026-11-10", unMes: true, faltaDelMes: null })).toEqual({ tipo: "cerrado", resultado: 8_000, porCien: 20 });
  });

  it("unas fechas que no son un mes dicen lo que dejaron, sin estimar", () => {
    expect(teDejaDelMes({ f: F, ver: VER, mes: "2026-11", hoy: "2026-11-10", unMes: false, faltaDelMes: FALTA })).toEqual({ tipo: "tramo", resultado: 8_000 });
  });

  it("sin lo que falta gastar no estima (saldría alto) y lo dice", () => {
    const x = teDejaDelMes({ f: F, ver: VER, mes: "2026-11", hoy: "2026-11-10", unMes: true, faltaDelMes: null });
    expect(x).toMatchObject({ tipo: "sin_estimado", hastaHoy: 8_000 });
  });

  it("sin ventas no hay ritmo", () => {
    const x = teDejaDelMes({ f: fila({ ventas: 0, margen: 0, gastos: 3_000 }), ver: VER, mes: "2026-11", hoy: "2026-11-02", unMes: true, faltaDelMes: [] });
    expect(x.tipo).toBe("sin_estimado");
  });

  it("sin fila no inventa nada", () => {
    expect(teDejaDelMes({ f: null, ver: VER, mes: "2026-11", hoy: "2026-11-10", unMes: true, faltaDelMes: [] }).tipo).toBe("sin_dato");
  });
});
