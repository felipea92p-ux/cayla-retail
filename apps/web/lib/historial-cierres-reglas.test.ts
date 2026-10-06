import { describe, expect, it } from "vitest";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorMes, bloqueFecha, cuadreDelTurno, duracionTurno, estadoCierre, resumirCierres, rutaDelEfectivo } from "./historial-cierres-reglas";

function cierre(p: Partial<CierreCaja>): CierreCaja {
  return {
    id: "x", ubicacionId: "u", ubicacionNombre: "TRU", montoApertura: 100, abiertaEn: "2026-10-05T13:37:00Z", abiertaPorNombre: null,
    montoCierreSistema: 500, montoCierreReal: 500, diferencia: 0, cerradaEn: "2026-10-06T02:12:00Z", cerradaPorNombre: null, nota: null,
    esPrueba: false, montoFondo: null, fondoRequerido: null, traslados: [], aperturaEsperada: null, motivoDiferenciaApertura: null, ...p,
  } as CierreCaja;
}

describe("historial de cierres", () => {
  it("estadoCierre: menos de un céntimo cuadra", () => {
    expect(estadoCierre(0)).toBe("cuadro");
    expect(estadoCierre(0.004)).toBe("cuadro");
    expect(estadoCierre(-5)).toBe("falto");
    expect(estadoCierre(2.2)).toBe("sobro");
  });

  it("resumirCierres cuenta y suma solo lo que no cuadró", () => {
    const r = resumirCierres([cierre({}), cierre({ diferencia: -5 }), cierre({ diferencia: 2.2 })]);
    expect(r).toEqual({ total: 3, cuadraron: 1, conDiferencia: 2, diferenciaNeta: -2.8 });
    expect(resumirCierres([])).toEqual({ total: 0, cuadraron: 0, conDiferencia: 0, diferenciaNeta: 0 });
  });

  it("agruparPorMes usa la hora de Lima (la noche del 30 no salta de mes) y conserva el orden", () => {
    const g = agruparPorMes([
      cierre({ id: "a", cerradaEn: "2026-10-01T03:00:00Z" }), // 30/09 22:00 en Lima
      cierre({ id: "b", cerradaEn: "2026-10-03T15:00:00Z" }),
    ]);
    expect(g.map((x) => x.etiqueta)).toEqual(["Setiembre 2026", "Octubre 2026"]);
    expect(g[0].cierres[0].id).toBe("a");
  });

  it("bloqueFecha da el día de Lima", () => {
    expect(bloqueFecha("2026-10-06T02:12:00Z").dia).toBe("5");
  });

  it("duracionTurno", () => {
    expect(duracionTurno("2026-10-05T13:37:00Z", "2026-10-06T02:12:00Z")).toBe("12 h 35 min");
    expect(duracionTurno("2026-10-05T13:00:00Z", "2026-10-05T13:45:00Z")).toBe("45 min");
    expect(duracionTurno("2026-10-06T13:00:00Z", "2026-10-05T13:45:00Z")).toBe("");
  });

  it("cuadreDelTurno: apertura + movió = esperado, siempre", () => {
    const c = cuadreDelTurno({ montoApertura: 317, montoCierreSistema: 1204.5 });
    expect(c.apertura + c.movio).toBeCloseTo(c.esperado, 2);
    expect(c.movio).toBe(887.5);
  });

  it("rutaDelEfectivo: sin fondo registrado no hay ruta; con fondo reparte la barra al 100 %", () => {
    expect(rutaDelEfectivo(cierre({}))).toBeNull();
    const r = rutaDelEfectivo(cierre({ montoFondo: 317, traslados: [{ destino: "caja_fuerte", monto: 887.5, referencia: null }] }));
    expect(r).toMatchObject({ trasladado: 887.5, quedo: 317, total: 1204.5 });
    expect(r!.pctTrasladado + r!.pctQuedo).toBe(100);
    expect(rutaDelEfectivo(cierre({ montoFondo: 0, traslados: [] }))).toMatchObject({ pctTrasladado: 0, pctQuedo: 0 });
  });
});
