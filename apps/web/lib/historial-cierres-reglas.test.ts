import { describe, expect, it } from "vitest";
import type { CierreCaja } from "@/lib/caja";
import { agruparPorDia, agruparPorMes, bloqueFecha, cascadaEfectivo, cobrosPorMedio, diaDelTurno, escalaDiferencia, etiquetaHora, franjaHora, duracionTurno, estadoCierre, paginaValida, quienAtendio, rachaDeCierres, resumirCierres, resumirPeriodo, rutaDelEfectivo, textoPeriodo, textoResultado } from "./historial-cierres-reglas";

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

describe("«Qué se cobró» del detalle de un cierre", () => {
  const pagos = [
    { ventaId: "a", metodo: "efectivo", monto: 100 },
    { ventaId: "b", metodo: "efectivo", monto: 50 },
    { ventaId: "b", metodo: "yape", monto: 25 },
    { ventaId: "c", metodo: "plin", monto: 25 },
    { ventaId: "d", metodo: "tarjeta", monto: 100 },
  ];

  it("suma por medio, junta Yape y Plin y cuenta ventas distintas", () => {
    const r = cobrosPorMedio(pagos);
    expect(r.total).toBe(300);
    expect(r.medios.map((m) => [m.clave, m.monto, m.ventas, m.pct])).toEqual([
      ["efectivo", 150, 2, 50],
      ["tarjeta", 100, 1, 33],
      ["yape", 50, 2, 17],
    ]);
  });

  it("el anticipo de una separación y el redondeo no son un medio ni suman al total", () => {
    const r = cobrosPorMedio([...pagos, { ventaId: "e", metodo: "anticipo", monto: 40 }, { ventaId: "e", metodo: "redondeo", monto: 0.05 }]);
    expect(r.total).toBe(300);
    expect(r.anticipo).toBe(40);
    expect(r.medios.some((m) => m.clave === "otro")).toBe(false);
  });

  it("sin pagos no hay medios ni porcentajes que dividan entre cero", () => {
    expect(cobrosPorMedio([])).toEqual({ total: 0, anticipo: 0, medios: [] });
  });

  it("un método que no se conoce cae en «Otro»", () => {
    expect(cobrosPorMedio([{ ventaId: "z", metodo: "cripto", monto: 10 }]).medios[0]).toMatchObject({ clave: "otro", monto: 10, ventas: 1, pct: 100 });
  });
});

describe("detalle de un cierre: «La línea del día»", () => {
  it("escalaDiferencia: cuadró al centro; el rango crece con la diferencia y nunca se sale de la escala", () => {
    expect(escalaDiferencia(0)).toEqual({ rango: 20, pos: 50 });
    expect(escalaDiferencia(0.004)).toEqual({ rango: 20, pos: 50 });
    expect(escalaDiferencia(2)).toEqual({ rango: 20, pos: 55 });
    expect(escalaDiferencia(-5.6)).toEqual({ rango: 20, pos: 36 });
    expect(escalaDiferencia(-114.6)).toMatchObject({ rango: 200 });
    expect(escalaDiferencia(-511.4)).toMatchObject({ rango: 1000 });
    expect(escalaDiferencia(-999999)).toEqual({ rango: 5000, pos: 3 });
    expect(escalaDiferencia(999999).pos).toBe(97);
  });

  it("etiquetaHora y franjaHora hablan en horas de tienda", () => {
    expect([0, 8, 12, 13, 23, 24].map(etiquetaHora)).toEqual(["12 a. m.", "8 a. m.", "12 p. m.", "1 p. m.", "11 p. m.", "12 a. m."]);
    expect(franjaHora(13)).toBe("1 – 2 p. m.");
    expect(franjaHora(11)).toBe("11 a. m. – 12 p. m.");
    expect(franjaHora(23)).toBe("11 p. m. – 12 a. m.");
  });

  // 2026-10-09 en Lima (UTC−5): 08:02 abre, 19:50 cierra.
  const base = { abiertaEn: "2026-10-09T13:02:00Z", cerradaEn: "2026-10-10T00:50:00Z" };
  const venta = (hora: string, total: number, unidades = 1, anulada = false) => ({ tipo: "venta" as const, hora, total, unidades, anulada });

  it("diaDelTurno: una barra por hora del turno, la hora fuerte y las cifras sin contar lo anulado", () => {
    const d = diaDelTurno(base, [
      venta("2026-10-09T14:00:00Z", 100, 2), // 09:00
      venta("2026-10-09T18:30:00Z", 250, 3), // 13:30 → hora fuerte
      venta("2026-10-09T18:50:00Z", 50, 1), // 13:50
      venta("2026-10-09T19:10:00Z", 999, 9, true), // anulada
    ]);
    expect(d.horas.map((h) => h.hora)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(d.horas.find((h) => h.pico)).toMatchObject({ hora: 13, total: 300 });
    expect(d.horas.filter((h) => h.pico)).toHaveLength(1);
    expect(d).toMatchObject({ ventas: 3, anuladas: 1, prendas: 6, vendido: 400, promedio: 133.33, horaFuerte: "1 – 2 p. m." });
    expect(d.horas.reduce((a, h) => a + h.total, 0)).toBe(400);
  });

  it("diaDelTurno: sin ventas no hay hora fuerte ni promedio, y las marcas caen dentro de la línea", () => {
    const d = diaDelTurno(base, [
      { tipo: "movimiento", hora: "2026-10-09T14:41:00Z", direccion: "egreso" },
      { tipo: "movimiento", hora: "2026-10-09T15:00:00Z", direccion: "ingreso" },
      { tipo: "devolucion", hora: "2026-10-09T16:05:00Z" },
      { tipo: "cambio", hora: "2026-10-09T17:02:00Z" },
    ]);
    expect(d).toMatchObject({ ventas: 0, promedio: null, horaFuerte: null, vendido: 0 });
    expect(d.marcas.map((m) => m.tipo)).toEqual(["apertura", "cierre", "sale", "entra", "sale", "cambio"]);
    expect(d.marcas.every((m) => m.pos >= 0 && m.pos <= 1)).toBe(true);
    expect(d.marcas[0].pos).toBeCloseTo(2 / 60 / 12, 3);
  });

  it("diaDelTurno: un turno que pasa la medianoche no se rompe", () => {
    const d = diaDelTurno({ abiertaEn: "2026-10-10T01:00:00Z", cerradaEn: "2026-10-10T06:30:00Z" }, [venta("2026-10-10T05:30:00Z", 80)]); // 20:00 → 01:30
    expect(d.horas.map((h) => h.hora)).toEqual([20, 21, 22, 23, 0, 1]);
    expect(d.horas.find((h) => h.pico)).toMatchObject({ hora: 0, total: 80 });
  });

  it("cascadaEfectivo: apertura + vendido + otros = esperado, siempre", () => {
    const c = { montoApertura: 277.2, montoCierreSistema: 967.6, montoCierreReal: 969.6 };
    const r = cascadaEfectivo(c, 712.1);
    expect(r).toEqual({ apertura: 277.2, vendido: 712.1, otros: -21.7, esperado: 967.6, contado: 969.6, diferencia: 2 });
    expect(r.apertura + r.vendido + r.otros).toBeCloseTo(r.esperado, 2);
    expect(cascadaEfectivo(c, 690.4).otros).toBe(0);
    expect(cascadaEfectivo(c, 600).otros).toBe(90.4); // entró plata que no fue venta (ingresos, cambios)
  });
});
