import { describe, expect, it } from "vitest";
import { armarMiMeta, resumirMiMeta, type FilaMiMeta, type FilaMisVentas } from "./mi-meta-reglas";

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
