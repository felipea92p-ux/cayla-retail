import { describe, expect, it } from "vitest";
import {
  armarMiMeta,
  rangoDeMiLectura,
  reconocer,
  resumirMiMeta,
  type FilaMiMeta,
  type FilaMisVentas,
} from "./mi-meta-reglas";

const HOY = "2026-09-29";

/** Setiembre 2026 completo: su meta del día es 500 de lunes a sábado y 0 (sin fila) los domingos. */
function filasMeta(metaMes = 13000, base: string | null = "horas"): FilaMiMeta[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = i + 1;
    const fecha = `2026-09-${String(d).padStart(2, "0")}`;
    const domingo = new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;
    return { fecha, meta_dia: domingo ? null : 500, meta_mes: metaMes, base };
  }).filter((f) => f.meta_dia !== null);
}

function filasVentas(porFecha: Record<string, { total: number; ventas: number }> = {}): FilaMisVentas[] {
  return Array.from({ length: 30 }, (_, i) => {
    const fecha = `2026-09-${String(i + 1).padStart(2, "0")}`;
    return { fecha, total: porFecha[fecha]?.total ?? 0, ventas: porFecha[fecha]?.ventas ?? 0 };
  });
}

describe("armarMiMeta: sin meta no hay bloque", () => {
  it("sin filas de fn_mi_meta devuelve null (la pantalla no dibuja «0 %»)", () => {
    expect(armarMiMeta(HOY, [], filasVentas())).toBeNull();
  });

  it("con una meta del mes en cero o nula devuelve null", () => {
    expect(armarMiMeta(HOY, filasMeta(0), filasVentas())).toBeNull();
    expect(armarMiMeta(HOY, [{ fecha: HOY, meta_dia: 500, meta_mes: null, base: "horas" }], filasVentas())).toBeNull();
  });

  it("con meta arma su serie: sus ventas de cada día y SU parte de la meta (null los días sin parte)", () => {
    const m = armarMiMeta(HOY, filasMeta(), filasVentas({ [HOY]: { total: 320, ventas: 2 } }))!;
    expect(m.metaMes).toBe(13000);
    expect(m.base).toBe("horas");
    expect(m.serie).toHaveLength(30);
    expect(m.serie.find((d) => d.fecha === HOY)).toMatchObject({ total: 320, ventas: 2, metaSede: 500 });
    // El 27 de setiembre de 2026 es domingo: no trabaja, no tiene parte.
    expect(m.serie.find((d) => d.fecha === "2026-09-27")?.metaSede).toBeNull();
  });

  it("entiende números que llegan como texto (numeric de Postgres)", () => {
    const m = armarMiMeta(HOY, [{ fecha: HOY, meta_dia: "500.00", meta_mes: "13000.00", base: "iguales" }], [{ fecha: HOY, total: "320.50", ventas: "2" }])!;
    expect(m.metaMes).toBe(13000);
    expect(m.base).toBe("iguales");
    expect(m.serie[0]).toMatchObject({ total: 320.5, ventas: 2, metaSede: 500 });
  });

  it("ordena la serie por fecha aunque las filas lleguen desordenadas", () => {
    const m = armarMiMeta(HOY, filasMeta(), [...filasVentas()].reverse())!;
    expect(m.serie[0].fecha).toBe("2026-09-01");
    expect(m.serie.at(-1)?.fecha).toBe("2026-09-30");
  });
});

describe("resumirMiMeta", () => {
  const ventas = { [HOY]: { total: 320, ventas: 2 }, "2026-09-28": { total: 900, ventas: 5 }, "2026-09-10": { total: 4000, ventas: 20 } };

  it("hoy: lo que vendió hoy contra SU parte de hoy", () => {
    const r = resumirMiMeta(armarMiMeta(HOY, filasMeta(), filasVentas(ventas))!);
    expect(r.hoy).toEqual({ vendido: 320, ventas: 2, meta: 500, pct: 64 });
  });

  it("mes: lo vendido en el mes contra la meta del mes, y cuánto tocaba llevar a hoy", () => {
    const r = resumirMiMeta(armarMiMeta(HOY, filasMeta(), filasVentas(ventas))!);
    expect(r.mes.vendido).toBe(5220);
    expect(r.mes.ventas).toBe(27);
    expect(r.mes.meta).toBe(13000);
    expect(r.mes.pct).toBe(40);
    // 26 días con parte en el mes (30 − 4 domingos); hasta el 29 pasaron 25 (el 27 no cuenta y el 30 todavía no llega): 25/26.
    expect(r.mes.tocabaPct).toBe(96);
  });

  it("un día sin parte (domingo) no tiene meta de hoy: pct nulo, no cero", () => {
    const m = armarMiMeta("2026-09-27", filasMeta(), filasVentas({ "2026-09-27": { total: 100, ventas: 1 } }))!;
    expect(resumirMiMeta(m).hoy).toEqual({ vendido: 100, ventas: 1, meta: null, pct: null });
  });

  it("sin ventas hoy es un cero de verdad, con su meta", () => {
    const r = resumirMiMeta(armarMiMeta(HOY, filasMeta(), filasVentas())!);
    expect(r.hoy).toEqual({ vendido: 0, ventas: 0, meta: 500, pct: 0 });
    expect(r.mes.pct).toBe(0);
  });

  it("no mezcla los días de la semana que caen en el mes anterior con el mes", () => {
    // 2 de octubre: la semana empieza el 26 de setiembre; el mes de octubre solo suma octubre.
    const meta: FilaMiMeta[] = [
      { fecha: "2026-09-30", meta_dia: 500, meta_mes: 9000, base: "horas" },
      { fecha: "2026-10-01", meta_dia: 500, meta_mes: 9000, base: "horas" },
      { fecha: "2026-10-02", meta_dia: 500, meta_mes: 9000, base: "horas" },
    ];
    const v: FilaMisVentas[] = [
      { fecha: "2026-09-30", total: 700, ventas: 3 },
      { fecha: "2026-10-01", total: 200, ventas: 1 },
      { fecha: "2026-10-02", total: 300, ventas: 2 },
    ];
    const r = resumirMiMeta(armarMiMeta("2026-10-02", meta, v)!);
    expect(r.mes.vendido).toBe(500);
    expect(r.mes.ventas).toBe(3);
  });
});

// ── «Lo que va bien» ───────────────────────────────────────────────────────────────────────────────

/** Arma una `MiMeta` a mano: `dias` = [fecha, vendió, ventas, meta del día | null]. */
function miMeta(dias: [string, number, number, number | null][], metaMes = 13000, hoy = HOY) {
  return {
    hoy,
    metaMes,
    base: "horas" as const,
    serie: dias.map(([fecha, total, ventas, metaSede]) => ({ fecha, total, ventas, metaSede, metaAsignada: null })),
  };
}

describe("rangoDeMiLectura: pide también el mes anterior para comparar el ticket", () => {
  it("desde el primer día del mes pasado hasta el último de este", () => {
    expect(rangoDeMiLectura("2026-09-29")).toEqual({ desde: "2026-08-01", hasta: "2026-09-30" });
  });
  it("en enero, el mes pasado es diciembre del año anterior", () => {
    expect(rangoDeMiLectura("2026-01-10")).toEqual({ desde: "2025-12-01", hasta: "2026-01-31" });
  });
});

describe("reconocer: mejor día", () => {
  it("es el día del mes con más ventas, contra SU meta de ese día", () => {
    const r = reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-12", 650, 4, 500], ["2026-09-29", 100, 1, 500]]));
    expect(r.mejorDia).toEqual({ fecha: "2026-09-12", total: 650, pctMeta: 130, esHoy: false });
  });
  it("si el mejor día es hoy lo dice", () => {
    expect(reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-29", 700, 5, 500]])).mejorDia?.esHoy).toBe(true);
  });
  it("sin una sola venta en el mes no hay mejor día (no se inventa)", () => {
    expect(reconocer(miMeta([["2026-09-10", 0, 0, 500]])).mejorDia).toBeNull();
  });
  it("no mira el mes pasado: un día de agosto no es el mejor de setiembre", () => {
    expect(reconocer(miMeta([["2026-08-20", 900, 6, null], ["2026-09-10", 300, 2, 500]])).mejorDia?.fecha).toBe("2026-09-10");
  });
});

describe("reconocer: racha", () => {
  const dia = (n: number, total: number, meta: number | null) => [`2026-09-${String(n).padStart(2, "0")}`, total, total > 0 ? 2 : 0, meta] as [string, number, number, number | null];
  it("cuenta días seguidos hacia atrás desde ayer, con 85 % de la meta o más", () => {
    expect(reconocer(miMeta([dia(25, 300, 500), dia(26, 430, 500), dia(27, 500, 500), dia(28, 450, 500)])).racha).toBe(3);
  });
  it("un día de descanso (sin parte de la meta) no corta la racha ni suma", () => {
    expect(reconocer(miMeta([dia(25, 450, 500), dia(26, 0, null), dia(27, 480, 500), dia(28, 500, 500)])).racha).toBe(3);
  });
  it("una racha de un solo día no se nombra", () => {
    expect(reconocer(miMeta([dia(27, 300, 500), dia(28, 500, 500)])).racha).toBe(0);
  });
  it("hoy no la corta ni la alarga: todavía está en juego", () => {
    expect(reconocer(miMeta([dia(27, 500, 500), dia(28, 500, 500), dia(29, 0, 500)])).racha).toBe(2);
  });
  it("exactamente 85 % cuenta; 84 % no", () => {
    expect(reconocer(miMeta([dia(27, 425, 500), dia(28, 425, 500)])).racha).toBe(2);
    expect(reconocer(miMeta([dia(27, 420, 500), dia(28, 420, 500)])).racha).toBe(0);
  });
});

describe("reconocer: ticket contra el mes pasado", () => {
  it("lo dice solo si SUBIÓ y hay muestra en los dos meses", () => {
    const r = reconocer(miMeta([["2026-08-10", 600, 10, null], ["2026-09-10", 700, 10, 500]]));
    expect(r.ticket).toMatchObject({ actual: 70, anterior: 60, subioPct: 17 });
  });
  it("si bajó, calla (no es un logro y la pantalla no lo dibuja)", () => {
    expect(reconocer(miMeta([["2026-08-10", 700, 10, null], ["2026-09-10", 600, 10, 500]])).ticket).toBeNull();
  });
  it("con muy pocas ventas en cualquiera de los dos meses, calla", () => {
    expect(reconocer(miMeta([["2026-08-10", 600, 4, null], ["2026-09-10", 700, 10, 500]])).ticket).toBeNull();
    expect(reconocer(miMeta([["2026-08-10", 600, 10, null], ["2026-09-10", 700, 4, 500]])).ticket).toBeNull();
  });
  it("una subida menor a 1 % tampoco se dice", () => {
    expect(reconocer(miMeta([["2026-08-10", 1000, 10, null], ["2026-09-10", 1004, 10, 500]])).ticket).toBeNull();
  });
});

describe("reconocer: próximo hito", () => {
  it("lo que falta dicho en días de su promedio por día trabajado", () => {
    const r = reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-11", 600, 4, 500], ["2026-09-12", 500, 4, 500]], 3000));
    expect(r.hito.falta).toBe(1500);
    expect(r.hito.promedio).toBe(500);
    expect(r.hito.diasDePromedio).toBe(3);
    expect(r.hito.diasQueQuedan).toBe(1); // hoy es 29 de 30
  });
  it("si ya llegó a la meta del mes, no hay días de promedio que decir", () => {
    const r = reconocer(miMeta([["2026-09-10", 2000, 8, 500], ["2026-09-11", 2000, 8, 500], ["2026-09-12", 2000, 8, 500]], 3000));
    expect(r.hito.falta).toBe(0);
    expect(r.hito.diasDePromedio).toBeNull();
  });
  it("sin ventas no hay promedio ni proyección: no se divide por cero", () => {
    const r = reconocer(miMeta([["2026-09-10", 0, 0, 500]]));
    expect(r.hito.promedio).toBeNull();
    expect(r.hito.diasDePromedio).toBeNull();
    expect(r.hito.proyeccion).toBeNull();
  });
  it("proyecta el cierre solo con 3 o más días con ventas", () => {
    expect(reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-11", 600, 4, 500]])).hito.proyeccion).toBeNull();
    expect(reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-11", 600, 4, 500], ["2026-09-12", 500, 4, 500]])).hito.proyeccion).not.toBeNull();
  });
  it("la proyección nunca queda por debajo de lo ya vendido", () => {
    const r = reconocer(miMeta([["2026-09-10", 400, 3, 500], ["2026-09-11", 600, 4, 500], ["2026-09-12", 500, 4, 500]], 3000, "2026-09-30"));
    expect(r.hito.proyeccion).toBeGreaterThanOrEqual(1500);
  });
});

describe("reconocer: hoy llegó a su meta", () => {
  it("con lo vendido igual o mayor a la meta del día", () => {
    expect(reconocer(miMeta([["2026-09-29", 500, 3, 500]])).hoyLograda).toBe(true);
    expect(reconocer(miMeta([["2026-09-29", 499, 3, 500]])).hoyLograda).toBe(false);
  });
  it("sin parte de la meta hoy (descanso) nunca es «lograda»", () => {
    expect(reconocer(miMeta([["2026-09-29", 300, 2, null]])).hoyLograda).toBe(false);
  });
});
