import { describe, expect, it } from "vitest";
import {
  agruparCola,
  corteDeUrl,
  cortesOfrecidos,
  filasDeTabla,
  leerCortesMes,
  totalDeTabla,
  barrasPorDia,
  barrasPorMes,
  cambio,
  colorDeMetodo,
  diaEnPalabras,
  leerSeriesMes,
  mejorDia,
  topeDelEje,
  nombreDeMetodo,
  promedioDiarioDelMes,
  tramosDePago,

  comparacionDe,
  diasDelTramo,
  leerReporteMes,
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
  });

  it("con divisor 0 son null, no NaN ni infinito", () => {
    const vacio = { vendido: 0, tickets: 0, unidades: 0, devuelto: 0 };
    expect(ticketPromedio(vacio)).toBeNull();
    expect(prendasPorVenta(vacio)).toBeNull();
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

  it("una barra por día, con el número de su día bajo CADA barra, y el fin de semana en negrita", () => {
    const b = barrasPorDia(s);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.etiqueta)).toEqual(["1", "2", "3", "4", "5"]);
    expect(b.map((x) => !!x.fuerte)).toEqual([false, false, true, true, false]); // 3 y 4 de octubre de 2026: sábado y domingo
    expect(b[0]!.tip).toMatch(/^jueves 1 · S\/\s100 · 2 ventas$/);
    expect(b[2]!.tip).toMatch(/1 venta$/);
    expect(b[1]!.valor).toBe(0);
  });

  it("en el celular solo se ven el 1, cada 5 y el último: el resto es opcional (y el 30 también si pega con el 31)", () => {
    const b4 = barrasPorDia({ ...s, dias: s.dias.slice(0, 4) });
    expect(b4.map((x) => !!x.opcional)).toEqual([false, true, true, false]); // el 4 es el último: se ve aunque no sea de cada 5
    const mes31 = Array.from({ length: 31 }, (_, i) => ({ fecha: `2026-10-${String(i + 1).padStart(2, "0")}`, vendido: 10, tickets: 1 }));
    const visibles = barrasPorDia({ ...s, dias: mes31 }).filter((x) => !x.opcional).map((x) => x.etiqueta);
    expect(visibles).toEqual(["1", "5", "10", "15", "20", "25", "31"]); // sin el 30, que quedaría pegado al 31
    const mes30 = mes31.slice(0, 30);
    expect(barrasPorDia({ ...s, dias: mes30 }).filter((x) => !x.opcional).map((x) => x.etiqueta)).toEqual(["1", "5", "10", "15", "20", "25", "30"]);
  });

  it("el mejor día es el de más ventas (el primero si empatan) y no hay si no se vendió nada", () => {
    expect(mejorDia(s)).toEqual({ fecha: "2026-10-03", vendido: 300.5, tickets: 1 });
    expect(mejorDia({ ...s, dias: s.dias.map((d) => ({ ...d, vendido: 0 })) })).toBeNull();
    expect(mejorDia({ ...s, dias: [] })).toBeNull();
  });

  it("el tope del eje es redondo, cubre la barra mayor y no deja mucho aire", () => {
    expect(topeDelEje(6109)).toBe(7000); // la maqueta: S/ 7,000 arriba y S/ 3,500 al medio
    expect(topeDelEje(1100)).toBe(1500); // 2 000 dejaría 45 % de aire
    expect(topeDelEje(235)).toBe(300);
    expect(topeDelEje(1000)).toBe(1000); // justo en el tope
    expect(topeDelEje(0)).toBe(1);
    expect(topeDelEje(Number.NaN)).toBe(1);
    for (const max of [1, 7, 48, 99, 235, 999, 1100, 1510, 4213, 6109, 9999, 12905, 134306]) {
      const tope = topeDelEje(max);
      expect(tope).toBeGreaterThanOrEqual(max);
      expect(tope / max).toBeLessThanOrEqual(1.5 + 1e-9); // con la mitad de la potencia el peor caso es 1,5 (de 2 a 3 pasos)
    }
  });

  it("la raya es el promedio diario del mes que se mira: todo el mes si está cerrado, del 1 a hoy si está en curso", () => {
    const cerrado = leerReporteMes(BASE)!; // octubre entero: 31 días, S/ 134,306.29
    expect(promedioDiarioDelMes(cerrado)).toBeCloseTo(134306.29 / 31, 6);
    const enCurso = leerReporteMes({
      mes: "2026-11-01", hoy: "2026-11-04", en_curso: true, primera_venta: "2026-08-20",
      actual: { desde: "2026-11-01", hasta: "2026-11-05", vendido: 7200, tickets: 40, unidades: 60, devuelto: 0 }, // del 1 al 4: 4 días
      anterior: { desde: "2026-10-01", hasta: "2026-10-05", vendido: 14656, tickets: 200, unidades: 300, devuelto: 0 },
    })!;
    expect(promedioDiarioDelMes(enCurso)).toBeCloseTo(7200 / 4, 6); // 1,800 al día: no el de octubre
    expect(promedioDiarioDelMes({ ...cerrado, primeraVenta: "2026-09-30" })).toBeCloseTo(134306.29 / 31, 6); // no depende de si el mes pasado se compara
    expect(promedioDiarioDelMes({ ...cerrado, actual: { ...cerrado.actual, vendido: 0 } })).toBeNull(); // sin ventas no hay raya
  });
});
