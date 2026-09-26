import { describe, it, expect } from "vitest";
import {
  avanceDeHoy,
  consolidar,
  descuentoPct,
  diaDelMes,
  diasDelMes,
  horaLima,
  horaPico,
  ordenarPorExcepcion,
  ritmoDelMes,
  serieHoras,
  textoEstado,
  ticketPromedio,
  unidadesPorTicket,
  UMBRAL_BAJO_META,
  UMBRAL_SOBRE_META,
  type NumerosSede,
} from "./comercial-reglas";

function sede(parcial: Partial<NumerosSede>): NumerosSede {
  return {
    metaVentaDiaria: null,
    ventasHoy: 0, ticketsHoy: 0, unidadesHoy: 0, devueltoHoy: 0,
    ventasSemana: 0, ticketsSemana: 0, unidadesSemana: 0, devueltoSemana: 0,
    ventasMes: 0, ticketsMes: 0, unidadesMes: 0, devueltoMes: 0,
    ...parcial,
  };
}

describe("calendario", () => {
  it("días del mes, con febrero bisiesto y no bisiesto", () => {
    expect(diasDelMes("2026-09-18")).toBe(30);
    expect(diasDelMes("2026-10-01")).toBe(31);
    expect(diasDelMes("2028-02-10")).toBe(29);
    expect(diasDelMes("2027-02-10")).toBe(28);
  });
  it("día del mes sin correr el día por la zona horaria", () => {
    expect(diaDelMes("2026-09-01")).toBe(1);
    expect(diaDelMes("2026-09-30")).toBe(30);
  });
});

describe("horaLima", () => {
  it("las 7:30 pm de Lima son las 00:30 UTC del día siguiente: la hora es 19, no 0", () => {
    expect(horaLima(new Date("2026-09-19T00:30:00Z"))).toBe(19);
  });
  it("medianoche de Lima es hora 0 (nunca 24)", () => {
    expect(horaLima(new Date("2026-09-18T05:00:00Z"))).toBe(0);
    expect(horaLima(new Date("2026-09-18T04:59:00Z"))).toBe(23);
  });
});

describe("ritmoDelMes — el semáforo mira días CERRADOS, no lo de hoy", () => {
  // Meta S/800 al día. Hoy es el día 11: hay 10 días cerrados → se prometieron S/8.000.
  const base = { metaVentaDiaria: 800, fecha: "2026-09-11" };

  it("la venta de hoy no cambia el semáforo (a las 11 am nadie está 'atrasado')", () => {
    const sinHoy = ritmoDelMes({ ...base, ventasMes: 8000, ventasHoy: 0 });
    const conHoyEnCero = ritmoDelMes({ ...base, ventasMes: 8100, ventasHoy: 100 });
    expect(sinHoy.ritmo).toBe(1);
    expect(conHoyEnCero.ritmo).toBe(1);
  });

  it("bajo: por debajo del 85% de lo prometido", () => {
    // 10 días × 800 = 8000; vendió 6.700 → 83,75%
    expect(ritmoDelMes({ ...base, ventasMes: 6700, ventasHoy: 0 }).estado).toBe("bajo");
  });

  it("en el borde exacto: 85% ya es 'en ruta' y 100% ya es 'sobre'", () => {
    expect(ritmoDelMes({ ...base, ventasMes: 8000 * UMBRAL_BAJO_META, ventasHoy: 0 }).estado).toBe("en_ruta");
    expect(ritmoDelMes({ ...base, ventasMes: 8000 * UMBRAL_SOBRE_META, ventasHoy: 0 }).estado).toBe("sobre");
    expect(ritmoDelMes({ ...base, ventasMes: 7999, ventasHoy: 0 }).estado).toBe("en_ruta");
  });

  it("el día 1 no hay días cerrados: no inventa un ritmo", () => {
    const r = ritmoDelMes({ metaVentaDiaria: 800, fecha: "2026-09-01", ventasMes: 300, ventasHoy: 300 });
    expect(r).toEqual({ estado: "sin_dias_cerrados", ritmo: null, proyeccion: null, diasCerrados: 0 });
  });

  it("sin meta: no hay semáforo, pero la proyección se calcula igual", () => {
    const r = ritmoDelMes({ metaVentaDiaria: null, fecha: "2026-09-11", ventasMes: 5000, ventasHoy: 0 });
    expect(r.estado).toBe("sin_meta");
    expect(r.ritmo).toBeNull();
    expect(r.proyeccion).toBe(15000); // 5000 / 10 días × 30
  });

  it("una meta de 0 se trata como sin meta (evita dividir por cero)", () => {
    expect(ritmoDelMes({ metaVentaDiaria: 0, fecha: "2026-09-11", ventasMes: 5000, ventasHoy: 0 }).estado).toBe("sin_meta");
  });

  it("proyección lineal sobre los días cerrados, sin contar hoy", () => {
    const r = ritmoDelMes({ ...base, ventasMes: 9000, ventasHoy: 1000 });
    expect(r.proyeccion).toBe(24000); // (9000 − 1000) / 10 × 30
  });

  it("si ventasHoy supera a ventasMes por redondeo no da un ritmo negativo", () => {
    const r = ritmoDelMes({ ...base, ventasMes: 100, ventasHoy: 100.004 });
    expect(r.ritmo).toBe(0);
  });
});

describe("avanceDeHoy", () => {
  it("fracción de la meta del día, o null sin meta", () => {
    expect(avanceDeHoy(400, 800)).toBe(0.5);
    expect(avanceDeHoy(400, null)).toBeNull();
    expect(avanceDeHoy(400, 0)).toBeNull();
  });
});

describe("promedios sin 0/0", () => {
  it("ticket promedio y unidades por ticket", () => {
    expect(ticketPromedio(150, 3)).toBe(50);
    expect(unidadesPorTicket(5, 3)).toBeCloseTo(1.6667, 3);
  });
  it("con cero tickets devuelve null, no NaN", () => {
    expect(ticketPromedio(0, 0)).toBeNull();
    expect(unidadesPorTicket(0, 0)).toBeNull();
  });
  it("descuento sobre precio de lista", () => {
    expect(descuentoPct(300, 10)).toBeCloseTo(0.0333, 3);
    expect(descuentoPct(0, 0)).toBeNull();
  });
});

describe("ordenarPorExcepcion — lo que necesita atención, primero", () => {
  const f = (nombre: string, estado: Parameters<typeof textoEstado>[0], ritmo: number | null, ventasMes: number) => ({
    nombre,
    ventasMes,
    ritmo: { estado, ritmo, proyeccion: null, diasCerrados: 10 },
  });
  it("bajo antes que en ruta antes que sobre; sin meta al final", () => {
    const orden = ordenarPorExcepcion([
      f("sobre", "sobre", 1.2, 9000),
      f("sin meta", "sin_meta", null, 20000),
      f("bajo", "bajo", 0.7, 5000),
      f("en ruta", "en_ruta", 0.9, 7000),
    ]).map((x) => x.nombre);
    expect(orden).toEqual(["bajo", "en ruta", "sobre", "sin meta"]);
  });
  it("entre dos tiendas bajo su ritmo, la MÁS atrasada va primero", () => {
    const orden = ordenarPorExcepcion([f("a", "bajo", 0.8, 1), f("b", "bajo", 0.5, 1)]).map((x) => x.nombre);
    expect(orden).toEqual(["b", "a"]);
  });
  it("entre tiendas sin meta, gana la que más vendió", () => {
    const orden = ordenarPorExcepcion([f("x", "sin_meta", null, 100), f("y", "sin_meta", null, 900)]).map((x) => x.nombre);
    expect(orden).toEqual(["y", "x"]);
  });
  it("no muta el arreglo original", () => {
    const original = [f("b", "bajo", 0.5, 1), f("a", "sobre", 1.5, 1)];
    ordenarPorExcepcion(original);
    expect(original[0].nombre).toBe("b");
  });
});

describe("consolidar", () => {
  it("suma las tiendas", () => {
    const c = consolidar(
      [sede({ ventasHoy: 150.5, ticketsHoy: 3, ventasMes: 450 }), sede({ ventasHoy: 120, ticketsHoy: 1, ventasMes: 420 })],
      "2026-09-18"
    );
    expect(c.ventasHoy).toBe(270.5);
    expect(c.ticketsHoy).toBe(4);
    expect(c.ventasMes).toBe(870);
    expect(c.tiendas).toBe(2);
  });

  it("el ritmo consolidado usa SOLO las tiendas con meta (no infla con la venta de una sin meta)", () => {
    const c = consolidar(
      [
        sede({ metaVentaDiaria: 100, ventasMes: 1700, ventasHoy: 0 }), // 17 días cerrados × 100 = 1700 → 100%
        sede({ metaVentaDiaria: null, ventasMes: 50000, ventasHoy: 0 }), // sin meta: NO debe entrar
      ],
      "2026-09-18"
    );
    expect(c.tiendasConMeta).toBe(1);
    expect(c.ritmo.ritmo).toBe(1);
    expect(c.ventasMes).toBe(51700); // pero el TOTAL vendido sí las suma
  });

  it("sin ninguna meta el consolidado no tiene semáforo", () => {
    const c = consolidar([sede({ ventasMes: 100 }), sede({ ventasMes: 200 })], "2026-09-18");
    expect(c.metaVentaDiaria).toBeNull();
    expect(c.ritmo.estado).toBe("sin_meta");
  });

  it("evita los errores de coma flotante al sumar centavos", () => {
    const c = consolidar([sede({ ventasHoy: 0.1 }), sede({ ventasHoy: 0.2 })], "2026-09-18");
    expect(c.ventasHoy).toBe(0.3);
  });
});

describe("serieHoras", () => {
  it("rellena con cero las horas sin ventas entre la primera y la última", () => {
    expect(serieHoras([{ hora: 10, ventas: 50 }, { hora: 13, ventas: 20 }], null)).toEqual([
      { hora: 10, monto: 50 },
      { hora: 11, monto: 0 },
      { hora: 12, monto: 0 },
      { hora: 13, monto: 20 },
    ]);
  });
  it("se extiende hasta la hora actual si es más tarde que la última venta", () => {
    const s = serieHoras([{ hora: 10, ventas: 50 }], 12);
    expect(s.map((p) => p.hora)).toEqual([10, 11, 12]);
  });
  it("nunca dibuja un rango fijo: una tienda que abre a las 11 empieza a las 11", () => {
    expect(serieHoras([{ hora: 11, ventas: 5 }], null)[0].hora).toBe(11);
  });
  it("sin ventas devuelve vacío (la pantalla dice 'aún no hay ventas')", () => {
    expect(serieHoras([], 15)).toEqual([]);
  });
});

describe("horaPico", () => {
  it("la hora con más ventas; en empate, la más temprana", () => {
    expect(horaPico([{ hora: 10, ventas: 5 }, { hora: 19, ventas: 90 }, { hora: 15, ventas: 90 }])).toBe(15);
    expect(horaPico([])).toBeNull();
  });
});

describe("textoEstado", () => {
  it("todos los estados tienen texto propio (el color nunca es la única señal)", () => {
    const textos = (["bajo", "en_ruta", "sobre", "sin_dias_cerrados", "sin_meta"] as const).map(textoEstado);
    expect(new Set(textos).size).toBe(5);
  });
});
