import { describe, expect, it } from "vitest";
import {
  antiguedad,
  faltaPara,
  comparativoEnCantidad,
  comparativoEnPorcentaje,
  horaDeLima,
  horaDeReloj,
  progresoDeEnvio,
  tonoPorEnviar,
  tonoVendidoHoy,
  ventanaDelDiaLima,
  ventanaHastaEstaHora,
  ventasUnicas,
} from "./facturacion-resumen-reglas";

describe("ventanaDelDiaLima", () => {
  it("un mediodía de Lima cae en el día de Lima, de medianoche a medianoche", () => {
    // 2026-09-18 12:00 Lima = 17:00 UTC
    expect(ventanaDelDiaLima(new Date("2026-09-18T17:00:00Z"))).toEqual({ desde: "2026-09-18T05:00:00.000Z", hasta: "2026-09-19T05:00:00.000Z" });
  });

  it("las 7:30 pm de Lima ya son el día siguiente en UTC, y aun así son del día de Lima (el caso de ADR-0110)", () => {
    // 2026-09-18 19:30 Lima = 2026-09-19 00:30 UTC
    expect(ventanaDelDiaLima(new Date("2026-09-19T00:30:00Z"))).toEqual({ desde: "2026-09-18T05:00:00.000Z", hasta: "2026-09-19T05:00:00.000Z" });
  });

  it("justo a la medianoche de Lima empieza el día nuevo", () => {
    expect(ventanaDelDiaLima(new Date("2026-09-19T05:00:00Z")).desde).toBe("2026-09-19T05:00:00.000Z");
    expect(ventanaDelDiaLima(new Date("2026-09-19T04:59:59Z")).desde).toBe("2026-09-18T05:00:00.000Z");
  });
});

describe("ventanaHastaEstaHora", () => {
  it("el mismo día de la semana pasada, de su medianoche de Lima a la misma hora de reloj de Lima", () => {
    // ahora: viernes 2026-09-18 12:00 Lima → la referencia es el viernes 2026-09-11, hasta las 12:00 Lima
    expect(ventanaHastaEstaHora(new Date("2026-09-18T17:00:00Z"), 7)).toEqual({ desde: "2026-09-11T05:00:00.000Z", hasta: "2026-09-11T17:00:00.000Z" });
  });

  it("con las 7:30 pm de Lima (UTC ya del día siguiente) la ventana sale del día de LIMA, no del de UTC", () => {
    // ahora: 2026-09-19 00:30 UTC = viernes 18 19:30 Lima. Restar 7 días al día UTC daría el 12 (sábado en Lima).
    expect(ventanaHastaEstaHora(new Date("2026-09-19T00:30:00Z"), 7)).toEqual({ desde: "2026-09-11T05:00:00.000Z", hasta: "2026-09-12T00:30:00.000Z" });
  });

  it("con 0 días atrás es el día de hoy hasta ahora", () => {
    expect(ventanaHastaEstaHora(new Date("2026-09-18T17:00:00Z"), 0)).toEqual({ desde: "2026-09-18T05:00:00.000Z", hasta: "2026-09-18T17:00:00.000Z" });
  });

  it("cruza el fin de año sin perder días", () => {
    // jueves 2026-01-01 10:00 Lima → jueves 2025-12-25
    expect(ventanaHastaEstaHora(new Date("2026-01-01T15:00:00Z"), 7)).toEqual({ desde: "2025-12-25T05:00:00.000Z", hasta: "2025-12-25T15:00:00.000Z" });
  });
});

describe("horaDeLima", () => {
  it("devuelve la hora de reloj de Lima con decimales (13:09 = 13.15)", () => {
    expect(horaDeLima("2026-09-18T18:09:00Z")).toBeCloseTo(13.15, 5);
  });

  it("a las 7:30 pm de Lima (UTC del día siguiente) sigue siendo 19.5", () => {
    expect(horaDeLima("2026-09-19T00:30:00Z")).toBe(19.5);
  });
});

describe("horaDeReloj", () => {
  it("«13:09» son 13.15 y «10:00» son 10", () => {
    expect(horaDeReloj("13:09")).toBeCloseTo(13.15, 5);
    expect(horaDeReloj("10:00")).toBe(10);
  });

  it("sin minutos legibles no es NaN: cuenta como la hora en punto", () => {
    expect(horaDeReloj("13")).toBe(13);
  });
});

describe("ventasUnicas", () => {
  it("una venta con dos comprobantes (dos filas del left join) cuenta una sola vez", () => {
    const filas = [{ venta_id: "a", total: 100 }, { venta_id: "a", total: 100 }, { venta_id: "b", total: 50 }];
    expect(ventasUnicas(filas)).toEqual([{ venta_id: "a", total: 100 }, { venta_id: "b", total: 50 }]);
  });

  it("conserva el orden y no toca lo que ya es único", () => {
    const filas = [{ venta_id: "z" }, { venta_id: "y" }];
    expect(ventasUnicas(filas)).toEqual(filas);
  });
});

describe("tonoVendidoHoy", () => {
  it("verde si va por encima de la referencia; ámbar si por debajo", () => {
    expect(tonoVendidoHoy(950, 848)).toBe("verde");
    expect(tonoVendidoHoy(700, 848)).toBe("ambar");
  });

  it("igual a la referencia no está por debajo: verde", () => {
    expect(tonoVendidoHoy(848, 848)).toBe("verde");
  });

  it("sin referencia (nula o cero) no hay nada que juzgar: taupe", () => {
    expect(tonoVendidoHoy(950, null)).toBe("taupe");
    expect(tonoVendidoHoy(950, 0)).toBe("taupe");
  });
});

describe("tonoPorEnviar", () => {
  it("rojo si hay rechazados, aunque haya más pendientes", () => {
    expect(tonoPorEnviar({ porEnviar: 5, rechazados: 1 })).toBe("rojo");
  });

  it("ámbar si solo hay pendientes; verde si no queda nada", () => {
    expect(tonoPorEnviar({ porEnviar: 3, rechazados: 0 })).toBe("ambar");
    expect(tonoPorEnviar({ porEnviar: 0, rechazados: 0 })).toBe("verde");
  });
});

describe("comparativoEnPorcentaje", () => {
  it("+12% cuando hoy supera a la referencia (S/950 contra S/848)", () => {
    expect(comparativoEnPorcentaje(950, 848)).toEqual({ texto: "+12%", positivo: true });
  });

  it("con el signo menos tipográfico cuando va por debajo", () => {
    expect(comparativoEnPorcentaje(400, 500)).toEqual({ texto: "−20%", positivo: false });
  });

  it("igual a la referencia: +0%, no negativo", () => {
    expect(comparativoEnPorcentaje(500, 500)).toEqual({ texto: "+0%", positivo: true });
  });

  it("una diferencia diminuta por debajo redondea a 0 sin escribir «−0%»", () => {
    expect(comparativoEnPorcentaje(999, 1000)).toEqual({ texto: "+0%", positivo: true });
  });

  it("con referencia 0 o ausente no hay porcentaje", () => {
    expect(comparativoEnPorcentaje(950, 0)).toBeNull();
    expect(comparativoEnPorcentaje(950, null)).toBeNull();
  });
});

describe("comparativoEnCantidad", () => {
  it("+1 cuando hay una venta más que la semana pasada", () => {
    expect(comparativoEnCantidad(3, 2)).toEqual({ texto: "+1", positivo: true });
  });

  it("−2 cuando hay dos menos", () => {
    expect(comparativoEnCantidad(1, 3)).toEqual({ texto: "−2", positivo: false });
  });

  it("contra una semana sin ventas sí se puede comparar en cantidad (+3 contra 0)", () => {
    expect(comparativoEnCantidad(3, 0)).toEqual({ texto: "+3", positivo: true });
  });

  it("sin lectura de la referencia no hay comparativo", () => {
    expect(comparativoEnCantidad(3, null)).toBeNull();
  });
});

describe("antiguedad", () => {
  const AHORA = new Date("2026-09-18T20:00:00Z");
  const hace = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000).toISOString();

  it("menos de un minuto: «hace instantes»", () => {
    expect(antiguedad(hace(0), AHORA)).toBe("hace instantes");
    expect(antiguedad(hace(59), AHORA)).toBe("hace instantes");
  });

  it("minutos: «hace 12 min»", () => {
    expect(antiguedad(hace(60), AHORA)).toBe("hace 1 min");
    expect(antiguedad(hace(12 * 60 + 30), AHORA)).toBe("hace 12 min");
    expect(antiguedad(hace(59 * 60 + 59), AHORA)).toBe("hace 59 min");
  });

  it("horas y minutos: «hace 6 h 42 min»; en punto solo las horas", () => {
    expect(antiguedad(hace(6 * 3600 + 42 * 60), AHORA)).toBe("hace 6 h 42 min");
    expect(antiguedad(hace(3 * 3600), AHORA)).toBe("hace 3 h");
    expect(antiguedad(hace(23 * 3600 + 59 * 60), AHORA)).toBe("hace 23 h 59 min");
  });

  it("desde 24 h: días enteros, «hace 3 d»", () => {
    expect(antiguedad(hace(24 * 3600), AHORA)).toBe("hace 1 d");
    expect(antiguedad(hace(3 * 24 * 3600 + 5 * 3600), AHORA)).toBe("hace 3 d");
  });

  it("nunca negativa: un reloj adelantado se lee como «hace instantes»", () => {
    expect(antiguedad(hace(-300), AHORA)).toBe("hace instantes");
  });
});

describe("progresoDeEnvio", () => {
  it("cuenta enviados y aceptados sobre los comprobantes que no son anulados ni no emitidos", () => {
    const filas = [
      { estado: "aceptado" as const },
      { estado: "enviado" as const },
      { estado: "pendiente" as const },
      { estado: "rechazado" as const },
      { estado: "anulado" as const },
      { estado: "no_emitido" as const },
    ];
    expect(progresoDeEnvio(filas)).toEqual({ enviados: 2, total: 4 });
  });

  it("sin comprobantes hoy: 0 de 0 (la tarjeta lo dice con palabras, no con una barra vacía)", () => {
    expect(progresoDeEnvio([])).toEqual({ enviados: 0, total: 0 });
  });
});

describe("faltaPara", () => {
  const AHORA = new Date("2026-09-18T20:00:00Z");
  const dentroDe = (segundos: number) => new Date(AHORA.getTime() + segundos * 1000).toISOString();

  it("menos de un minuto (o ya pasado): «instantes», nunca un número negativo", () => {
    expect(faltaPara(dentroDe(30), AHORA)).toBe("instantes");
    expect(faltaPara(dentroDe(-3600), AHORA)).toBe("instantes");
  });

  it("minutos, horas con sus minutos y días: la misma forma que antiguedad", () => {
    expect(faltaPara(dentroDe(45 * 60), AHORA)).toBe("45 min");
    expect(faltaPara(dentroDe(5 * 3600 + 20 * 60), AHORA)).toBe("5 h 20 min");
    expect(faltaPara(dentroDe(3 * 3600), AHORA)).toBe("3 h");
    expect(faltaPara(dentroDe(2 * 24 * 3600 + 3600), AHORA)).toBe("2 d");
  });
});
