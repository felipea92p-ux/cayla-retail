import { describe, expect, it } from "vitest";
import { curvaAcumulada, horasComparadas, leerPagos, mejorYPeorHora, metodosComparados, tickets, valorEn, vendidoHasta, veredicto, type PagoDelDia } from "./caja-comparativa-reglas";

const p = (ventaId: string, hhmm: string, monto: number, metodo = "efectivo"): PagoDelDia => {
  const [h, m] = hhmm.split(":").map(Number);
  return { ventaId, minuto: h! * 60 + m!, metodo, monto };
};
const min = (hhmm: string) => p("x", hhmm, 0).minuto;

// Ayer: 9:30 S/ 90, 10:15 S/ 100, 15:05 S/ 150, 15:30 S/ 100 (la hora 15 entera = S/ 250), 18:00 S/ 500. Total S/ 940.
const AYER = [p("a1", "9:30", 90), p("a2", "10:15", 100, "yape"), p("a3", "15:05", 150), p("a4", "15:30", 100, "tarjeta"), p("a5", "18:00", 500, "yape")];
// Hoy a las 15:10: 9:20 S/ 180, 10:40 S/ 170, 15:02 S/ 50.
const HOY = [p("h1", "9:20", 180), p("h2", "10:40", 170, "yape"), p("h3", "15:02", 50)];

describe("vendidoHasta y tickets", () => {
  it("corta por minuto (exclusivo) o toma el día completo", () => {
    expect(vendidoHasta(AYER, null)).toBe(940);
    expect(vendidoHasta(AYER, min("15:10"))).toBe(340);
    expect(vendidoHasta(AYER, min("9:30"))).toBe(0);
  });
  it("cuenta tickets, no pagos: una venta con dos medios es un ticket", () => {
    expect(tickets([p("v", "9:00", 10), p("v", "9:00", 20, "yape"), p("w", "9:05", 5)])).toBe(2);
  });
});

describe("veredicto", () => {
  it("la meta es el día completo de ayer; compara también contra la misma hora", () => {
    const v = veredicto(HOY, AYER, min("15:10"));
    expect(v.hoy).toBe(400);
    expect(v.ayerDia).toBe(940);
    expect(v.pctDelDiaDeAyer).toBeCloseTo(42.55, 1);
    expect(v.falta).toBe(540);
    expect(v.superado).toBe(false);
    expect(v.ayerAEstaHora).toBe(340);
    expect(v.pctAEstaHora).toBeCloseTo(17.6, 1);
    expect(v.ticketsHoy).toBe(3);
    expect(v.ticketPromedio).toBeCloseTo(133.33, 1);
  });
  it("cuando supera el día de ayer, falta es 0 y superado es true", () => {
    const v = veredicto([p("z", "12:00", 1000)], AYER, min("12:30"));
    expect(v.superado).toBe(true);
    expect(v.falta).toBe(0);
  });
  it("si ayer no vendió nada no divide por cero", () => {
    const v = veredicto(HOY, [], min("15:10"));
    expect(v.pctDelDiaDeAyer).toBe(0);
    expect(v.pctAEstaHora).toBeNull();
    expect(v.superado).toBe(false);
  });
});

describe("horasComparadas: la hora en curso se compara por minutos, no contra la hora entera de ayer", () => {
  it("a las 15:10, los S/ 50 de hoy se comparan con lo de ayer de 15:00 a 15:10 (S/ 150), no con los S/ 250", () => {
    const filas = horasComparadas(HOY, AYER, min("15:10"));
    const h15 = filas.find((f) => f.hora === 15)!;
    expect(h15.enCurso).toBe(true);
    expect(h15.hoy).toBe(50);
    expect(h15.ayer).toBe(150);
    expect(h15.diferencia).toBe(-100);
  });
  it("a las 15:35 ayer ya llevaba S/ 250 en esa hora", () => {
    const h15 = horasComparadas(HOY, AYER, min("15:35")).find((f) => f.hora === 15)!;
    expect(h15.ayer).toBe(250);
    expect(h15.diferencia).toBe(-200);
  });
  it("las horas cerradas se comparan enteras", () => {
    const h9 = horasComparadas(HOY, AYER, min("15:10")).find((f) => f.hora === 9)!;
    expect(h9).toMatchObject({ hoy: 180, ayer: 90, diferencia: 90, enCurso: false });
  });
  it("llega hasta la hora actual y la hora actual es la única en curso", () => {
    const filas = horasComparadas(HOY, AYER, min("15:10"));
    expect(filas[filas.length - 1]!.hora).toBe(15);
    expect(filas.filter((f) => f.enCurso)).toHaveLength(1);
  });
  it("al cruzar la hora en punto nace una hora nueva en curso y la anterior cierra entera", () => {
    const filas = horasComparadas(HOY, AYER, min("16:01"));
    expect(filas.find((f) => f.hora === 15)).toMatchObject({ enCurso: false, ayer: 250, hoy: 50 });
    expect(filas.find((f) => f.hora === 16)).toMatchObject({ enCurso: true });
  });
  it("mejor y peor hora en palabras", () => {
    const { mejor, peor } = mejorYPeorHora(horasComparadas(HOY, AYER, min("15:35")));
    expect(mejor?.hora).toBe(9);
    expect(peor?.hora).toBe(15);
  });
});

describe("curvaAcumulada", () => {
  it("el punto de hoy está siempre en la hora actual; ayer sigue todo el día", () => {
    const c = curvaAcumulada(HOY, AYER, min("15:10"), null);
    expect(c.hoy[c.hoy.length - 1]).toEqual({ minuto: min("15:10"), monto: 400 });
    expect(c.ayer[c.ayer.length - 1]!.monto).toBe(940);
    expect(c.hastaMin).toBeGreaterThanOrEqual(min("18:00"));
  });
  it("valorEn interpola entre puntos y no se sale de la curva", () => {
    const c = curvaAcumulada(HOY, AYER, min("15:10"), null);
    expect(valorEn(c.ayer, min("15:10"))).toBeCloseTo(340 + 0, -3);
    expect(valorEn(c.ayer, c.desdeMin - 100)).toBe(0);
    expect(valorEn(c.ayer, c.hastaMin + 100)).toBe(940);
  });
  it("sin ventas ninguno de los dos días no se rompe", () => {
    const c = curvaAcumulada([], [], min("10:00"), null);
    expect(c.hoy.length).toBeGreaterThan(0);
    expect(c.hastaMin).toBeGreaterThan(c.desdeMin);
  });
});

describe("metodosComparados y leerPagos", () => {
  it("solo los medios usados, en el orden del sistema", () => {
    expect(metodosComparados(HOY, AYER).map((m) => m.metodo)).toEqual(["efectivo", "yape", "tarjeta"]);
    expect(metodosComparados(HOY, AYER)[1]).toEqual({ metodo: "yape", hoy: 170, ayerDia: 600 });
  });
  it("lee montos que llegan como texto", () => {
    expect(leerPagos([{ venta_id: "v", minuto: "605", metodo: "yape", monto: "12.50" }])).toEqual([{ ventaId: "v", minuto: 605, metodo: "yape", monto: 12.5 }]);
    expect(leerPagos(null)).toEqual([]);
  });
});
