import { describe, expect, it } from "vitest";
import {
  barrasPorDia,
  barrasPorMes,
  cambio,
  colorDeMetodo,
  diaEnPalabras,
  leerSeriesMes,
  mejorDia,
  nombreDeMetodo,
  promedioDiarioAnterior,
  tramosDePago,

  comparacionDe,
  diasDelTramo,
  leerReporteMes,
  parteDevuelta,
  prendasPorVenta,
  primerDiaDelMes,
  sentidoDe,
  textoCambio,
  tiendaDeUrl,
  ticketPromedio,
  tramoEnPalabras,
  type ReporteMes,
} from "./reportes-ventas-reglas";

// Lo que devuelve la base (`fn_reporte_ventas_mes`), con los números como llegan por PostgREST: jsonb, así que números de verdad.
const BASE = {
  mes: "2026-10-01",
  hoy: "2026-11-02",
  en_curso: false,
  primera_venta: "2026-08-20",
  actual: { desde: "2026-10-01", hasta: "2026-11-01", vendido: 134306.29, tickets: 1704, unidades: 2808, devuelto: 29.9 },
  anterior: { desde: "2026-09-01", hasta: "2026-10-01", vendido: 4000.5, tickets: 20, unidades: 31, devuelto: 0 },
};
const reporte = (cambios: Partial<ReporteMes> = {}): ReporteMes => ({ ...leerReporteMes(BASE)!, ...cambios });

describe("leerReporteMes: no deja pasar un dato roto", () => {
  it("lee lo que manda la base", () => {
    const r = leerReporteMes(BASE)!;
    expect(r.mes).toBe("2026-10-01");
    expect(r.enCurso).toBe(false);
    expect(r.primeraVenta).toBe("2026-08-20");
    expect(r.actual).toEqual({ desde: "2026-10-01", hasta: "2026-11-01", vendido: 134306.29, tickets: 1704, unidades: 2808, devuelto: 29.9 });
  });

  it("acepta los números como texto (numeric de Postgres) y los recorta a día", () => {
    const r = leerReporteMes({ ...BASE, actual: { ...BASE.actual, vendido: "134306.29", tickets: "1704" }, mes: "2026-10-01T00:00:00" })!;
    expect(r.actual.vendido).toBe(134306.29);
    expect(r.actual.tickets).toBe(1704);
    expect(r.mes).toBe("2026-10-01");
  });

  it("un número que no es número vale 0, no NaN", () => {
    const r = leerReporteMes({ ...BASE, actual: { ...BASE.actual, vendido: "abc", unidades: null, devuelto: undefined } })!;
    expect([r.actual.vendido, r.actual.unidades, r.actual.devuelto]).toEqual([0, 0, 0]);
  });

  it.each([null, undefined, 5, "x", [], {}, { ...BASE, actual: null }, { ...BASE, anterior: { vendido: 1 } }, { ...BASE, mes: "octubre" }])("una forma rota da null: %j", (roto) => {
    expect(leerReporteMes(roto)).toBeNull();
  });

  it("sin primera venta es null, y en_curso solo vale con true", () => {
    const r = leerReporteMes({ ...BASE, primera_venta: null, en_curso: "true" })!;
    expect(r.primeraVenta).toBeNull();
    expect(r.enCurso).toBe(false);
  });
});

describe("las cifras derivadas", () => {
  it("ticket, prendas por venta y parte devuelta", () => {
    const a = reporte().actual;
    expect(ticketPromedio(a)).toBeCloseTo(78.82, 2);
    expect(prendasPorVenta(a)).toBeCloseTo(1.65, 2);
    expect(parteDevuelta(a)).toBeCloseTo(0.000223, 6);
  });

  it("con divisor 0 son null, no NaN ni infinito", () => {
    const vacio = { vendido: 0, tickets: 0, unidades: 0, devuelto: 0 };
    expect(ticketPromedio(vacio)).toBeNull();
    expect(prendasPorVenta(vacio)).toBeNull();
    expect(parteDevuelta(vacio)).toBeNull();
  });
});

describe("cambio y su texto", () => {
  it("sube, baja e igual", () => {
    expect(cambio(112, 100)).toBeCloseTo(0.12);
    expect(cambio(90, 100)).toBeCloseTo(-0.1);
    expect(textoCambio(0.116)).toMatch(/^\+11[.,]6 %$/);
    expect(textoCambio(0.12)).toMatch(/^\+12 %$/);
    expect(textoCambio(-0.1)).toMatch(/^−10 %$/);
    expect(textoCambio(0.004)).toBe("igual");
    expect(textoCambio(-0.004)).toBe("igual");
  });

  it("contra un mes sin ventas no hay cambio: null, nunca infinito", () => {
    expect(cambio(100, 0)).toBeNull();
    expect(cambio(100, null)).toBeNull();
    expect(cambio(null, 100)).toBeNull();
    expect(textoCambio(null)).toBe("—");
    expect(sentidoDe(null)).toBeNull();
  });

  it("el sentido: medio punto de diferencia ya es «igual»", () => {
    expect(sentidoDe(0.3)).toBe("sube");
    expect(sentidoDe(-0.3)).toBe("baja");
    expect(sentidoDe(0.004)).toBe("igual");
  });
});

describe("el tramo y la comparación", () => {
  it("cuenta los días de un tramo (hasta no se incluye)", () => {
    expect(diasDelTramo({ desde: "2026-10-01", hasta: "2026-11-01" })).toBe(31);
    expect(diasDelTramo({ desde: "2026-11-01", hasta: "2026-11-03" })).toBe(2);
    expect(diasDelTramo({ desde: "2026-11-01", hasta: "2026-11-01" })).toBe(0);
    expect(diasDelTramo({ desde: "2026-11-05", hasta: "2026-11-01" })).toBe(0);
  });

  it("un mes cerrado se compara contra el anterior", () => {
    const c = comparacionDe(reporte());
    expect(c).toEqual({ hay: true, contra: "septiembre", mismosDias: null, frase: "vs septiembre" });
    expect(tramoEnPalabras(reporte())).toBe("el mes entero");
  });

  it("el mes en curso se compara por los mismos días", () => {
    const r = reporte({
      enCurso: true,
      mes: "2026-11-01",
      actual: { desde: "2026-11-01", hasta: "2026-11-03", vendido: 10668, tickets: 60, unidades: 100, devuelto: 0 },
      anterior: { desde: "2026-10-01", hasta: "2026-10-03", vendido: 9000, tickets: 50, unidades: 80, devuelto: 0 },
    });
    expect(comparacionDe(r)).toEqual({ hay: true, contra: "octubre", mismosDias: 2, frase: "vs octubre, los mismos 2 días" });
    expect(tramoEnPalabras(r)).toBe("a la fecha, 2 días");
    const uno = reporte({ ...r, actual: { ...r.actual, hasta: "2026-11-02" }, anterior: { ...r.anterior, hasta: "2026-10-02" } });
    expect(comparacionDe(uno)).toMatchObject({ frase: "vs octubre, los mismos 1 día" });
    expect(tramoEnPalabras(uno)).toBe("a la fecha, 1 día");
  });

  it("si el mes anterior quedó a medias (se empezó a vender dentro de él), no se compara y lo dice", () => {
    // Producción: la primera venta real es del 30 de septiembre; octubre contra septiembre daría «+3.840 %».
    const a_medias = reporte({ primeraVenta: "2026-09-30", anterior: { ...BASE.anterior, vendido: 3500, tickets: 12, unidades: 20 } });
    expect(comparacionDe(a_medias)).toEqual({ hay: false, motivo: "Septiembre quedó a medias: se empezó a vender el 30 de septiembre. No se compara." });
    // Si se empezó el primer día del mes anterior, ese mes sí está entero: se compara.
    expect(comparacionDe(reporte({ primeraVenta: "2026-09-01" }))).toMatchObject({ hay: true, contra: "septiembre" });
    // Si se empezó en el mes que se mira, no hay mes anterior: lo dice el motivo de siempre.
    const primero = reporte({ primeraVenta: "2026-10-04", anterior: { ...BASE.anterior, vendido: 0, tickets: 0, unidades: 0 } });
    expect(comparacionDe(primero)).toEqual({ hay: false, motivo: "Es el primer mes con ventas: no hay con qué compararlo." });
  });

  it("sin ventas en el tramo anterior, dice por qué no hay con qué comparar", () => {
    const vacioAntes = { ...BASE.anterior, vendido: 0, tickets: 0, unidades: 0 };
    expect(comparacionDe(reporte({ anterior: vacioAntes, primeraVenta: "2026-10-04" }))).toEqual({ hay: false, motivo: "Es el primer mes con ventas: no hay con qué compararlo." });
    expect(comparacionDe(reporte({ anterior: vacioAntes, primeraVenta: "2026-07-10" }))).toEqual({ hay: false, motivo: "No hubo ventas en septiembre para compararlo." });
    expect(comparacionDe(reporte({ anterior: vacioAntes, primeraVenta: null }))).toEqual({ hay: false, motivo: "Todavía no hay ventas." });
  });
});

describe("la URL", () => {
  it("la tienda es un uuid o nada", () => {
    const id = "22222222-2222-4222-8222-000000000001";
    expect(tiendaDeUrl(id)).toBe(id);
    expect(tiendaDeUrl(id.toUpperCase())).toBe(id);
    expect(tiendaDeUrl([id, "otra"])).toBe(id);
    for (const malo of ["", "todas", "1; drop table ventas", undefined, null, "22222222-2222-4222-8222"]) expect(tiendaDeUrl(malo)).toBeNull();
  });

  it("el primer día del mes lleva dos cifras", () => {
    expect(primerDiaDelMes({ anio: 2026, mes: 9 })).toBe("2026-09-01");
    expect(primerDiaDelMes({ anio: 2026, mes: 12 })).toBe("2026-12-01");
  });
});

/* ---------- las series de los gráficos ---------- */
const SERIES = {
  mes: "2026-10-01",
  hoy: "2026-11-02",
  dias: [
    { fecha: "2026-10-01", vendido: 100, tickets: 2 },
    { fecha: "2026-10-02", vendido: 0, tickets: 0 },
    { fecha: "2026-10-03", vendido: 300.5, tickets: 1 },
    { fecha: "2026-10-04", vendido: 120, tickets: 3 },
    { fecha: "2026-10-05", vendido: 300.5, tickets: 4 },
  ],
  pagos: [
    { metodo: "qr", monto: 42392.87 },
    { metodo: "efectivo", monto: 39409.24 },
    { metodo: "yape", monto: 20657.47 },
    { metodo: "redondeo", monto: 0.26 },
    { metodo: "anticipo", monto: 302.4 },
    { metodo: "transferencia", monto: 0 },
  ],
  meses: [
    { mes: "2026-09-01", vendido: 3500, tickets: 19, en_curso: false },
    { mes: "2026-10-01", vendido: 134306.29, tickets: 1704, en_curso: false },
    { mes: "2026-11-01", vendido: 10668, tickets: 87, en_curso: true },
  ],
};

describe("leerSeriesMes", () => {
  it("lee lo que manda la base", () => {
    const s = leerSeriesMes(SERIES)!;
    expect(s.dias).toHaveLength(5);
    expect(s.meses.map((m) => [m.mes, m.enCurso])).toEqual([["2026-09-01", false], ["2026-10-01", false], ["2026-11-01", true]]);
    expect(s.pagos[0]).toEqual({ metodo: "qr", monto: 42392.87 });
  });

  it("descarta una fila rota sin tumbar el gráfico y trata lo que no es lista como vacío", () => {
    const s = leerSeriesMes({ ...SERIES, dias: [{ fecha: "ayer", vendido: 5 }, { fecha: "2026-10-01", vendido: "abc", tickets: null }, null, 7], pagos: "x", meses: undefined })!;
    expect(s.dias).toEqual([{ fecha: "2026-10-01", vendido: 0, tickets: 0 }]);
    expect(s.pagos).toEqual([]);
    expect(s.meses).toEqual([]);
  });

  it.each([null, undefined, 5, [], { dias: [] }, { ...SERIES, mes: "octubre" }])("una forma rota da null: %j", (roto) => {
    expect(leerSeriesMes(roto)).toBeNull();
  });
});

describe("ventas por día", () => {
  const s = leerSeriesMes(SERIES)!;

  it("dice el día en palabras (fecha de Lima, sin correrse por la zona horaria)", () => {
    expect(diaEnPalabras("2026-10-10")).toBe("sábado 10");
    expect(diaEnPalabras("2026-11-01")).toBe("domingo 1");
    expect(diaEnPalabras("2026-10-05")).toBe("lunes 5");
  });

  it("una barra por día, con el número solo en el 1, cada 5 y el último, y el fin de semana en negrita", () => {
    const b = barrasPorDia(s);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.etiqueta)).toEqual(["1", "", "", "", "5"]);
    expect(b.map((x) => !!x.fuerte)).toEqual([false, false, true, true, false]); // 3 y 4 de octubre de 2026: sábado y domingo
    expect(b[0]!.tip).toMatch(/^jueves 1 · S\/\s100 · 2 ventas$/);
    expect(b[2]!.tip).toMatch(/1 venta$/);
    expect(b[1]!.valor).toBe(0);
  });

  it("el último día lleva su número aunque no sea de los de cada 5", () => {
    const b = barrasPorDia({ ...s, dias: s.dias.slice(0, 4) });
    expect(b.map((x) => x.etiqueta)).toEqual(["1", "", "", "4"]);
  });

  it("el mejor día es el de más ventas (el primero si empatan) y no hay si no se vendió nada", () => {
    expect(mejorDia(s)).toEqual({ fecha: "2026-10-03", vendido: 300.5, tickets: 1 });
    expect(mejorDia({ ...s, dias: s.dias.map((d) => ({ ...d, vendido: 0 })) })).toBeNull();
    expect(mejorDia({ ...s, dias: [] })).toBeNull();
  });

  it("el promedio diario anterior solo existe si se puede comparar", () => {
    const r = leerReporteMes(BASE)!; // septiembre (30 días, S/ 4,000.50)
    expect(promedioDiarioAnterior(r)).toBeCloseTo(4000.5 / 30, 6);
    expect(promedioDiarioAnterior({ ...r, primeraVenta: "2026-09-30" })).toBeNull(); // septiembre quedó a medias
    expect(promedioDiarioAnterior({ ...r, anterior: { ...r.anterior, vendido: 0 } })).toBeNull();
  });
});

describe("mes a mes", () => {
  const s = leerSeriesMes(SERIES)!;
  it("una barra por mes con ventas; el mes que se mira va en negrita y el de hoy, rayado", () => {
    const b = barrasPorMes(s);
    expect(b.map((x) => [x.clave, x.etiqueta, !!x.fuerte, !!x.rayada])).toEqual([
      ["2026-09", "Sep", false, false],
      ["2026-10", "Oct", true, false],
      ["2026-11", "Nov", false, true],
    ]);
    expect(b[2]!.tip).toContain("Noviembre 2026 (a la fecha)");
    expect(b[1]!.tip).toMatch(/Octubre 2026 · S\/\s134,306 · 1,704 ventas/);
  });

  it("sin meses con ventas no hay barras", () => {
    expect(barrasPorMes({ ...s, meses: [] })).toEqual([]);
  });
});

describe("cómo se pagó", () => {
  it("un tramo por medio, del que más al que menos, con su parte y su color", () => {
    const { total, tramos } = tramosDePago(leerSeriesMes(SERIES)!);
    expect(tramos.map((t) => t.metodo)).toEqual(["qr", "efectivo", "yape", "anticipo"]);
    expect(total).toBeCloseTo(42392.87 + 39409.24 + 20657.47 + 0.26 + 302.4, 2);
    expect(tramos[0]!.parte).toBeCloseTo(42392.87 / total, 6);
    expect(tramos.reduce((a, t) => a + t.parte, 0)).toBeLessThanOrEqual(1);
    expect(tramos[0]!.color).toBe("var(--color-metodo-qr)");
  });

  it("no dibuja lo que vale 0 ni el redondeo de céntimos", () => {
    const { tramos } = tramosDePago(leerSeriesMes(SERIES)!);
    expect(tramos.map((t) => t.metodo)).not.toContain("transferencia");
    expect(tramos.map((t) => t.metodo)).not.toContain("redondeo");
  });

  it("sin cobros no hay tramos ni divide por cero", () => {
    expect(tramosDePago({ pagos: [] })).toEqual({ total: 0, tramos: [] });
    expect(tramosDePago({ pagos: [{ metodo: "efectivo", monto: 0 }, { metodo: "yape", monto: -5 }] })).toEqual({ total: 0, tramos: [] });
  });

  it("los nombres: el de siempre, los especiales y, si es uno nuevo, tal cual; un medio sin token va en taupe, nunca un hex", () => {
    expect(nombreDeMetodo("yape")).toBe("Yape");
    expect(nombreDeMetodo("qr")).toBe("QR");
    expect(nombreDeMetodo("anticipo")).toBe("Anticipo de apartados");
    expect(nombreDeMetodo("redondeo")).toBe("Redondeo de efectivo");
    expect(nombreDeMetodo("cripto")).toBe("cripto");
    expect(colorDeMetodo("plin")).toBe("var(--color-metodo-plin)");
    expect(colorDeMetodo("cripto")).toBe("var(--color-taupe)");
    expect(colorDeMetodo("redondeo")).toBe("var(--color-taupe)");
  });
});
