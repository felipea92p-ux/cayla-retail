import { describe, it, expect } from "vitest";
import {
  comparativoSemanaAnterior,
  duracionAbierta,
  egresosElevados,
  formatoDuracion,
  metodosDe,
  rangoHorasCaja,
  ritmoDelDia,
  senalCaja,
  tendenciaCierres7Dias,
  ventasPorHora,
} from "./caja-panel-reglas";

function lima(anio: number, mes: number, dia: number, hora = 0, min = 0): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5, min));
}

describe("duracionAbierta", () => {
  const abierta = lima(2026, 9, 18, 11, 48).toISOString();
  it("con horas: minutos siempre a dos dígitos", () => {
    expect(duracionAbierta(abierta, lima(2026, 9, 18, 13, 56).getTime())).toBe("2 h 08 min");
    expect(duracionAbierta(abierta, lima(2026, 9, 18, 12, 48).getTime())).toBe("1 h 00 min");
  });
  it("antes de la primera hora: solo minutos", () => {
    expect(duracionAbierta(abierta, lima(2026, 9, 18, 12, 36).getTime())).toBe("48 min");
  });
  it("un reloj adelantado no da negativos", () => {
    expect(duracionAbierta(abierta, lima(2026, 9, 18, 11, 40).getTime())).toBe("0 min");
  });
  it("formatoDuracion: 64 minutos son 1 h 04 min", () => {
    expect(formatoDuracion(64)).toBe("1 h 04 min");
    expect(formatoDuracion(9)).toBe("9 min");
  });
});

describe("metodosDe", () => {
  it("separa un pago mixto y no repite", () => {
    expect(metodosDe("efectivo + yape")).toEqual(["efectivo", "yape"]);
    expect(metodosDe("yape + plin")).toEqual(["yape"]); // Yape y Plin son una sola fila, como en la dona
  });
  it("sin dato no inventa un método", () => {
    expect(metodosDe(null)).toEqual([]);
    expect(metodosDe("")).toEqual([]);
  });
  it("lo que no reconoce cae en 'otro', no se pierde", () => {
    expect(metodosDe("cheque")).toEqual(["otro"]);
  });
});

describe("ritmoDelDia", () => {
  // El caso real de las capturas: abre 12:03, ahora 14:13 → eje de 130 min.
  const abierta = lima(2026, 9, 18, 12, 3).toISOString();
  const ahora = lima(2026, 9, 18, 14, 13).getTime();
  const v = (ventaId: string, hora: string, total: number, metodosPago: string | null) => ({ ventaId, hora, total, metodosPago });
  const dia = [v("a", "12:48", 75, "efectivo"), v("b", "13:09", 338, "efectivo"), v("c", "13:09", 537, "yape")];

  it("cuenta, promedia y mide cuánto hace de la última", () => {
    const r = ritmoDelDia(dia, abierta, ahora);
    expect(r.cantidad).toBe(3);
    expect(r.total).toBe(950);
    expect(r.ticketPromedio).toBeCloseTo(316.67, 2);
    expect(r.minutosDesdeUltima).toBe(64);
    expect(r.metodos).toEqual(["efectivo", "yape"]);
  });

  it("ubica cada venta en el eje y apila las que caen juntas en vez de taparlas", () => {
    const [a, b, c] = ritmoDelDia(dia, abierta, ahora).puntos;
    expect(a!.pos).toBeCloseTo(45 / 130, 6);
    expect(b!.pos).toBeCloseTo(66 / 130, 6);
    expect(c!.pos).toBeCloseTo(66 / 130, 6);
    expect([a!.fila, b!.fila, c!.fila]).toEqual([0, 0, 1]); // 13:09 dos veces: la segunda sube
    expect(ritmoDelDia(dia, abierta, ahora).filas).toBe(2);
  });

  it("el área del punto sigue al monto: la venta mayor pesa 1 y las demás su raíz", () => {
    const [a, b, c] = ritmoDelDia(dia, abierta, ahora).puntos;
    expect(c!.peso).toBe(1);
    expect(b!.peso).toBeCloseTo(Math.sqrt(338 / 537), 6);
    expect(a!.peso).toBeLessThan(b!.peso);
  });

  it("las ventas de una caja anterior del mismo día no cuentan", () => {
    const r = ritmoDelDia([v("x", "09:30", 120, "efectivo"), ...dia], abierta, ahora);
    expect(r.cantidad).toBe(3);
    expect(r.total).toBe(950);
  });

  it("una caja que quedó abierta de ayer arranca el eje a medianoche", () => {
    const ayer = lima(2026, 9, 17, 18, 0).toISOString();
    const r = ritmoDelDia([v("m", "08:00", 50, "efectivo")], ayer, ahora);
    expect(r.puntos[0]!.pos).toBeCloseTo(480 / 853, 6); // 08:00 sobre 00:00 → 14:13
    expect(r.abrioHoy).toBe(false); // para que la etiqueta diga "desde medianoche" y no una hora de ayer
    expect(ritmoDelDia(dia, abierta, ahora).abrioHoy).toBe(true);
  });

  it("sin ventas: ceros, sin 'desde la última' y sin inventar puntos", () => {
    const r = ritmoDelDia([], abierta, ahora);
    expect(r).toMatchObject({ cantidad: 0, ticketPromedio: 0, minutosDesdeUltima: null, puntos: [], filas: 0, metodos: [] });
  });

  it("un reloj atrasado no deja puntos fuera del eje", () => {
    const r = ritmoDelDia([v("z", "14:20", 10, "efectivo")], abierta, ahora); // "del futuro"
    expect(r.puntos[0]!.pos).toBe(1);
    expect(r.minutosDesdeUltima).toBe(0);
  });
});

describe("ventasPorHora / rangoHorasCaja", () => {
  it("agrupa por hora de Lima, no de UTC", () => {
    const eventos = [
      { hora: lima(2026, 9, 18, 14, 10).toISOString(), total: 50 },
      { hora: lima(2026, 9, 18, 14, 45).toISOString(), total: 30 },
      { hora: lima(2026, 9, 18, 15, 0).toISOString(), total: 20 },
    ];
    const mapa = ventasPorHora(eventos);
    expect(mapa.get(14)).toBe(80);
    expect(mapa.get(15)).toBe(20);
  });

  it("el rango va desde la hora de apertura hasta ahora, sin horas inventadas", () => {
    const abierta = lima(2026, 9, 18, 9, 0).toISOString();
    const ahora = lima(2026, 9, 18, 12, 30);
    expect(rangoHorasCaja(abierta, ahora)).toEqual([9, 10, 11, 12]);
  });
});

describe("tendenciaCierres7Dias", () => {
  const ubicacionId = "sede-1";
  const ahora = lima(2026, 9, 18, 20, 0);

  it("suma cierres del mismo día y marca descuadre si alguno no cuadró", () => {
    const cierres = [
      { ubicacionId, cerradaEn: lima(2026, 9, 18, 13, 0).toISOString(), montoApertura: 100, montoCierreReal: 400, diferencia: 0 },
      { ubicacionId, cerradaEn: lima(2026, 9, 18, 19, 0).toISOString(), montoApertura: 400, montoCierreReal: 450, diferencia: 5 },
      { ubicacionId: "otra-sede", cerradaEn: lima(2026, 9, 18, 13, 0).toISOString(), montoApertura: 0, montoCierreReal: 9999, diferencia: 0 },
    ];
    const serie = tendenciaCierres7Dias(cierres, ubicacionId, ahora);
    expect(serie).toHaveLength(7);
    const hoy = serie[serie.length - 1]!;
    expect(hoy.esHoy).toBe(true);
    expect(hoy.monto).toBe(300 + 50);
    expect(hoy.descuadre).toBe(true);
  });

  it("un día sin cierres queda en cero, no se inventa un valor", () => {
    const serie = tendenciaCierres7Dias([], ubicacionId, ahora);
    expect(serie.every((p) => p.monto === 0 && !p.descuadre)).toBe(true);
  });
});

describe("comparativoSemanaAnterior", () => {
  it("null si la semana pasada fue cero — no hay con qué comparar", () => {
    expect(comparativoSemanaAnterior(500, 0, "jueves")).toBeNull();
  });
  it("positivo cuando hoy va mejor", () => {
    expect(comparativoSemanaAnterior(560, 500, "jueves")).toEqual({ texto: "▲ 12% vs. jueves pasado", positivo: true });
  });
  it("negativo cuando hoy va peor", () => {
    expect(comparativoSemanaAnterior(400, 500, "jueves")).toEqual({ texto: "▼ 20% vs. jueves pasado", positivo: false });
  });
});

describe("egresosElevados", () => {
  it("no alerta sin ventas todavía, aunque haya egresos", () => {
    expect(egresosElevados(50, 0)).toEqual({ alerta: false, pct: 0 });
  });
  it("alerta al cruzar el umbral", () => {
    expect(egresosElevados(20, 100)).toEqual({ alerta: true, pct: 20 });
  });
  it("no alerta bajo el umbral", () => {
    expect(egresosElevados(10, 100)).toEqual({ alerta: false, pct: 10 });
  });
});

describe("senalCaja", () => {
  it("verde sin cola pendiente", () => {
    expect(senalCaja(0)).toEqual({ tono: "verde", texto: "Caja abierta · sin pendientes" });
  });
  it("ámbar con cola pendiente, singular vs plural", () => {
    expect(senalCaja(1).texto).toBe("1 venta sin subir");
    expect(senalCaja(3).texto).toBe("3 ventas sin subir");
  });
});
