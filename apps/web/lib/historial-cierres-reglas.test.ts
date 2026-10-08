import { describe, expect, it } from "vitest";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorDia, agruparPorMes, bloqueFecha, cuadreDelTurno, duracionTurno, estadoCierre, paginaValida, quienAtendio, rachaDeCierres, resumirCierres, resumirPeriodo, rutaDelEfectivo, textoPeriodo, textoResultado } from "./historial-cierres-reglas";

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

describe("página del historial de cierres", () => {
  it("textoResultado habla en palabras de tienda", () => {
    expect(textoResultado(0)).toBe("Sí, cuadró");
    expect(textoResultado(-5.6)).toBe("Faltaron S/ 5.60");
    expect(textoResultado(31.4)).toBe("Sobraron S/ 31.40");
    expect(textoResultado(-1138.1)).toBe("Faltaron S/ 1,138.10");
  });

  it("quienAtendio dice el nombre una vez si abrió y cerró la misma persona", () => {
    expect(quienAtendio({ abiertaPorNombre: "Janis", cerradaPorNombre: "Janis" })).toEqual({ mismaPersona: true, nombre: "Janis" });
    expect(quienAtendio({ abiertaPorNombre: "Melany", cerradaPorNombre: "Janis" })).toEqual({ mismaPersona: false, abrio: "Melany", cerro: "Janis" });
    expect(quienAtendio({ abiertaPorNombre: null, cerradaPorNombre: null })).toEqual({ mismaPersona: false, abrio: "—", cerro: "—" });
  });

  it("agruparPorDia junta los cierres del mismo día de Lima, en el orden recibido", () => {
    const g = agruparPorDia([
      cierre({ id: "a", cerradaEn: "2026-10-08T01:13:00Z" }), // 7 oct 20:13 Lima
      cierre({ id: "b", cerradaEn: "2026-10-07T03:09:00Z" }), // 6 oct 22:09 Lima
      cierre({ id: "c", cerradaEn: "2026-10-07T01:07:00Z" }), // 6 oct 20:07 Lima
    ]);
    expect(g.map((x) => x.cierres.map((c) => c.id))).toEqual([["a"], ["b", "c"]]);
    expect(g[0].etiqueta).toMatch(/^Miércoles 7 de octubre$/i);
  });

  it("resumirPeriodo cuenta sobre todos los cierres y separa lo que faltó de lo que sobró", () => {
    const r = resumirPeriodo([
      { ubicacionId: "tru", diferencia: -5.6, cerradaEn: "2026-10-08T01:13:00Z" },
      { ubicacionId: "aqp", diferencia: -213, cerradaEn: "2026-10-07T03:09:00Z" },
      { ubicacionId: "tru", diferencia: 0, cerradaEn: "2026-10-07T01:07:00Z" },
      { ubicacionId: "tru", diferencia: 31.4, cerradaEn: "2026-10-04T21:55:00Z" },
    ]);
    expect(r).toMatchObject({ total: 4, cuadraron: 1, falto: 218.6, cierresFalto: 2, sobro: 31.4, cierresSobro: 1 });
    expect(r.desde).toBe("2026-10-04T21:55:00Z");
    expect(r.hasta).toBe("2026-10-08T01:13:00Z");
    expect(Object.fromEntries(r.porSede)).toEqual({ tru: 3, aqp: 1 });
  });

  it("textoPeriodo nombra el rango sin repetir el mes ni el año", () => {
    expect(textoPeriodo("2026-10-03T17:29:00Z", "2026-10-08T01:13:00Z")).toBe("del 3 al 7 de octubre");
    expect(textoPeriodo("2026-09-28T17:29:00Z", "2026-10-08T01:13:00Z")).toBe("del 28 de setiembre al 7 de octubre");
    expect(textoPeriodo("2026-10-08T01:13:00Z", "2026-10-08T01:13:00Z")).toBe("el 7 de octubre");
    expect(textoPeriodo(null, null)).toBe("");
  });

  it("paginaValida nunca sale del rango", () => {
    expect(paginaValida(undefined, 3)).toBe(1);
    expect(paginaValida("abc", 3)).toBe(1);
    expect(paginaValida("0", 3)).toBe(1);
    expect(paginaValida("2", 3)).toBe(2);
    expect(paginaValida("9", 3)).toBe(3);
    expect(paginaValida("2", 0)).toBe(1);
  });
});

describe("racha de «Último cierre»", () => {
  it("cuenta cada resultado con su plural y une con «y»", () => {
    expect(rachaDeCierres([{ diferencia: -5.6 }, { diferencia: 0 }, { diferencia: 0 }, { diferencia: 31.4 }, { diferencia: -511.4 }]).texto).toBe(
      "Últimos 5 cierres de esta tienda: 2 cuadraron, 2 faltaron y 1 sobró."
    );
    expect(rachaDeCierres([{ diferencia: 0 }, { diferencia: 0 }]).texto).toBe("Últimos 2 cierres de esta tienda: 2 cuadraron.");
  });
});
