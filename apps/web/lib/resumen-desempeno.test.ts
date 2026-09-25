import { describe, expect, it } from "vitest";
import { metricasDePeriodo, type DatosPeriodo, type FilaComparacion } from "./resumen-comparacion";
import {
  analizarDesempeno,
  armarDesempeno,
  calcularKpisDesempeno,
  contarTendencias,
  distribucionDesempeno,
  rankingRotacionDesempeno,
  dividirPeriodo,
  filtrarPorSellThrough,
  leerVistaDesempeno,
  mitadesDelDesempeno,
  ordenarDesempeno,
  periodoCompleto,
  ritmoDe,
  type AnalisisDesempeno,
  type Mitades,
} from "./resumen-desempeno";
import { diasDelRango, sumarDias } from "./resumen-periodo";
import { calcularVelocidad } from "./resumen-reglas";

// Desempeño: cómo se comportó el inventario DENTRO del período. Lo que se prueba: que el período
// se parte bien, que las fórmulas sean las canónicas (no una paralela) y que lo que no se puede
// medir salga null («N/D»), nunca NaN/Infinity ni un número inventado.

const COSTO = 40;
const periodo = (o: Partial<DatosPeriodo> = {}): DatosPeriodo => ({ ventas: 0, devoluciones: 0, importe: 0, costoVentas: COSTO * (o.ventas ?? 0), costoDevoluciones: COSTO * (o.devoluciones ?? 0), unidadesSinCosto: 0, entradas: 0, stockInicio: 0, stockCierre: 0, diasConStock: 15, ...o });

function fila(o: { id?: string; referencia?: string; categoriaId?: string; ledger?: boolean; a?: Partial<DatosPeriodo>; b?: Partial<DatosPeriodo> } = {}): FilaComparacion {
  return {
    varianteId: o.id ?? "v1",
    productoId: "p1",
    productoCodigo: null,
    productoEstado: "activo",
    referencia: o.referencia ?? "Casaca Luciana",
    categoriaId: o.categoriaId ?? "c1",
    categoria: "Casacas",
    sku: "CL-BE-M",
    codigo: null,
    codigosBarras: [],
    talla: "M",
    colorCodigo: "BE",
    color: "Beige",
    colorHex: null,
    costo: COSTO,
    estadoCosto: "oficial",
    ledgerConsistente: o.ledger ?? true,
    a: periodo(o.a),
    b: periodo(o.b),
  };
}

const M30: Mitades = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" }); // 15 + 15 días
const analizar = (o: Parameters<typeof fila>[0] = {}, m: Mitades = M30) => analizarDesempeno(fila(o), m);

describe("dividirPeriodo", () => {
  it("30 días → 15 y 15; 90 → 45 y 45", () => {
    expect(M30).toMatchObject({ dividido: true, diasPrimera: 15, diasSegunda: 15, dias: 30 });
    expect(M30.primera).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(M30.segunda).toEqual({ desde: "2026-09-16", hasta: "2026-09-30" });
    expect(dividirPeriodo({ desde: "2026-07-01", hasta: "2026-09-28" })).toMatchObject({ diasPrimera: 45, diasSegunda: 45, dias: 90 });
  });

  it("7 días → 3 y 4 (la mitad más reciente se queda con el día de más)", () => {
    const m = dividirPeriodo({ desde: "2026-09-13", hasta: "2026-09-19" });
    expect(m).toMatchObject({ dividido: true, diasPrimera: 3, diasSegunda: 4, dias: 7 });
    expect(m.primera).toEqual({ desde: "2026-09-13", hasta: "2026-09-15" });
    expect(m.segunda).toEqual({ desde: "2026-09-16", hasta: "2026-09-19" });
  });

  it("dos mitades contiguas que cubren el período exacto, para cualquier largo desde 2 días", () => {
    for (let n = 2; n <= 60; n++) {
      const rango = { desde: "2026-03-01", hasta: sumarDias("2026-03-01", n - 1) };
      const m = dividirPeriodo(rango);
      expect(m.dividido).toBe(true);
      expect(m.primera.desde).toBe(rango.desde);
      expect(m.segunda.hasta).toBe(rango.hasta);
      expect(sumarDias(m.primera.hasta, 1)).toBe(m.segunda.desde);
      expect(diasDelRango(m.primera)).toBe(m.diasPrimera);
      expect(diasDelRango(m.segunda)).toBe(m.diasSegunda);
      expect(m.diasPrimera + m.diasSegunda).toBe(n);
    }
  });

  it("un solo día no se parte: no hay tendencia posible", () => {
    const m = dividirPeriodo({ desde: "2026-09-19", hasta: "2026-09-19" });
    expect(m.dividido).toBe(false);
    expect(m.primera).toEqual(m.segunda);
    expect(m.dias).toBe(1);
  });
});

describe("periodoCompleto", () => {
  it("suma lo que se acumula y toma el stock al inicio de la 1.ª mitad y al cierre de la 2.ª", () => {
    const f = fila({
      a: { ventas: 5, devoluciones: 1, entradas: 10, stockInicio: 8, stockCierre: 12, diasConStock: 14.5 },
      b: { ventas: 7, devoluciones: 2, entradas: 4, stockInicio: 12, stockCierre: 3, diasConStock: 10 },
    });
    expect(periodoCompleto(f, true)).toMatchObject({ ventas: 12, devoluciones: 3, entradas: 14, stockInicio: 8, stockCierre: 3, diasConStock: 24.5 });
  });

  it("las devoluciones se restan sobre el TOTAL del período, no mitad por mitad", () => {
    // Vendió 5 en la 1.ª mitad; en la 2.ª le devuelven 3 sin vender nada: neto del período = 2, no 5 ni 0.
    const a = analizar({ a: { ventas: 5, stockInicio: 10, stockCierre: 5 }, b: { devoluciones: 3, stockInicio: 5, stockCierre: 8 } });
    expect(a.periodo.ventasNetas).toBe(2);
  });

  it("el COGS se junta en componentes: la devolución de la 2.ª mitad resta el costo de lo vendido en la 1.ª", () => {
    // Vendió 5 en la 1.ª mitad (COGS 200) y se los devolvieron en la 2.ª (costo 200): COGS neto del período = 0.
    // Restar mitad por mitad daría 200 − 0 = 200 (la 2.ª quedaría en 0 al no poder ser negativa).
    const a = analizar({ a: { ventas: 5, stockInicio: 10, stockCierre: 5 }, b: { devoluciones: 5, stockInicio: 5, stockCierre: 10 } });
    expect(a.periodo.baseRotacion.cogs).toBe(0);
    expect(a.periodo.rotacion).toBe(0); // hubo inventario y nada rotó (todo volvió)
  });

  it("una unidad sin costo en CUALQUIERA de las dos mitades deja la rotación del período en N/D", () => {
    const a = analizar({ a: { ventas: 5, stockInicio: 10, stockCierre: 5 }, b: { ventas: 4, unidadesSinCosto: 4, stockInicio: 5, stockCierre: 3 } });
    expect(a.periodo.rotacion).toBeNull();
    expect(a.periodo.motivoSinRotacion).toBe("ventas_sin_costo");
    // Lo demás del análisis (vendido, ritmo) no depende del costo y sigue calculándose.
    expect(a.periodo.ventasNetas).toBe(9);
    expect(a.ritmo).not.toBeNull();
  });

  it("sin poder partir el período se usa uno solo (contar los dos duplicaría todo)", () => {
    const f = fila({ a: { ventas: 4 }, b: { ventas: 4 } });
    expect(periodoCompleto(f, false).ventas).toBe(4);
  });

  it("si a una mitad le falta el dato de días con stock, el total tampoco lo inventa", () => {
    expect(periodoCompleto(fila({ a: { diasConStock: null }, b: { diasConStock: 10 } }), true).diasConStock).toBeNull();
  });
});

describe("analizarDesempeno: las fórmulas son las canónicas", () => {
  const f = fila({
    a: { ventas: 6, entradas: 10, stockInicio: 20, stockCierre: 24, diasConStock: 15 },
    b: { ventas: 9, entradas: 0, stockInicio: 24, stockCierre: 15, diasConStock: 15 },
  });

  it("vendido y ritmo: unidades netas ÷ días CON stock del período (no días del calendario)", () => {
    const a = analizarDesempeno(f, M30);
    expect(a.periodo.ventasNetas).toBe(15);
    expect(a.ritmo).toBeCloseTo(15 / 30, 5); // 30 días con stock
    // Con la mitad de los días en venta la misma venta es el doble de ritmo.
    const corto = analizar({ a: { ventas: 6, diasConStock: 5, stockInicio: 6, stockCierre: 4 }, b: { ventas: 9, diasConStock: 5, stockInicio: 4, stockCierre: 1 } });
    expect(corto.ritmo).toBeCloseTo(15 / 10, 5);
  });

  it("sell-through = ventas netas ÷ (stock al inicio del período + entradas de todo el período)", () => {
    expect(analizarDesempeno(f, M30).sellThrough).toBeCloseTo(Math.round((15 / (20 + 10)) * 1000) / 10, 5); // 50%
  });

  it("rotación = la MISMA de Comparar períodos (`metricasDePeriodo`) sobre el período entero", () => {
    const a = analizarDesempeno(f, M30);
    const directa = metricasDePeriodo(periodoCompleto(f, true), 30, f);
    expect(a.periodo.rotacion).toBe(directa.rotacion);
    // (stock al inicio + al cierre) ÷ 2 = (20 + 15) ÷ 2 = 17.5 → 15 ÷ 17.5
    expect(a.periodo.rotacion).toBeCloseTo(15 / 17.5, 5);
  });

  it("ritmo = 0 cuando hay evidencia de que no se vendió; null cuando no hay base para decirlo", () => {
    expect(analizar({ a: { stockInicio: 5, stockCierre: 5 }, b: { stockInicio: 5, stockCierre: 5 } }).ritmo).toBe(0); // 30 días con stock, cero ventas
    expect(analizar({ a: { stockInicio: 5, stockCierre: 5, diasConStock: 1 }, b: { stockInicio: 5, stockCierre: 5, diasConStock: 1 } }).ritmo).toBeNull(); // 2 días: poco historial
    expect(ritmoDe(calcularVelocidad({ ventas: 4, devoluciones: 0, diasConStock: 2, diasObservables: 30, ledgerConsistente: true }))).toBeNull();
  });

  it("lo que no se puede calcular es null (N/D), nunca NaN ni Infinity", () => {
    const nada = analizar({ a: { ventas: 3 }, b: { ventas: 2 } }); // vendió pero no tuvo stock ni entradas registrados
    expect(nada.periodo.rotacion).toBeNull();
    expect(nada.sellThrough).toBeNull();
    for (const x of [analizar(), nada, analizar({ ledger: false, a: { ventas: 3, stockInicio: 5, stockCierre: 5 } })]) {
      for (const v of [x.ritmo, x.sellThrough, x.periodo.rotacion, x.tendencia?.variacionPct ?? null]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("con el historial inconsistente no hay sell-through (no hay stock inicial fiable)", () => {
    expect(analizar({ ledger: false, a: { ventas: 5, stockInicio: 10, stockCierre: 5 }, b: { ventas: 3, stockInicio: 5, stockCierre: 2 } }).sellThrough).toBeNull();
  });
});

describe("tendencia: 2.ª mitad contra 1.ª", () => {
  const con = (ventasA: number, ventasB: number, extra: Parameters<typeof fila>[0] = {}, m: Mitades = M30) =>
    analizar({ a: { ventas: ventasA, stockInicio: 30, stockCierre: 30 }, b: { ventas: ventasB, stockInicio: 30, stockCierre: 30 }, ...extra }, m).tendencia;

  it("acelera, es estable o desacelera según el cambio de ritmo", () => {
    expect(con(3, 6)).toMatchObject({ direccion: "alza", variacionPct: 100 });
    expect(con(5, 5)).toMatchObject({ direccion: "estable", variacionPct: 0 });
    expect(con(6, 3)).toMatchObject({ direccion: "baja", variacionPct: -50 });
  });

  it("un cambio pequeño no cuenta: el umbral es TENDENCIA_UMBRAL_PCT (25%)", () => {
    expect(con(8, 11)?.direccion).toBe("alza"); // +37.5%
    expect(con(8, 9)?.direccion).toBe("estable"); // +12.5%
    expect(con(8, 7)?.direccion).toBe("estable"); // −12.5%
    expect(con(8, 5)?.direccion).toBe("baja"); // −37.5%
  });

  it("con muy pocas ventas no se afirma nada (N/D): 1 contra 2 no es una tendencia", () => {
    expect(con(1, 2)).toBeNull(); // 3 unidades < TENDENCIA_MIN_UNIDADES
    expect(con(2, 2)?.direccion).toBe("estable"); // 4 unidades: ya hay evidencia
  });

  it("sin base para el ritmo de alguna mitad es N/D", () => {
    expect(con(0, 6)).toBeNull(); // nada vendido en la 1.ª: sin base para el porcentaje
    expect(analizar({ a: { ventas: 4, diasConStock: 1, stockInicio: 5, stockCierre: 5 }, b: { ventas: 6, stockInicio: 5, stockCierre: 5 } }).tendencia).toBeNull(); // 1.ª con 1 día en venta
  });

  it("un período de un solo día no tiene tendencia", () => {
    const uno = dividirPeriodo({ desde: "2026-09-19", hasta: "2026-09-19" });
    expect(con(5, 5, {}, uno)).toBeNull();
  });

  it("funciona con 7 días (3 y 4) sin comparar peras con manzanas: compara ritmos, no totales", () => {
    const m7 = dividirPeriodo({ desde: "2026-09-13", hasta: "2026-09-19" });
    const t = analizar({ a: { ventas: 3, diasConStock: 3, stockInicio: 20, stockCierre: 20 }, b: { ventas: 4, diasConStock: 4, stockInicio: 20, stockCierre: 20 } }, m7).tendencia;
    expect(t?.direccion).toBe("estable"); // 1 uds/día contra 1 uds/día, aunque 4 > 3 en total
  });
});

describe("orden y filtros", () => {
  const filas: AnalisisDesempeno[] = [
    analizar({ id: "top", a: { ventas: 10, entradas: 20, stockInicio: 10, stockCierre: 8 }, b: { ventas: 20, stockInicio: 8, stockCierre: 4 } }),
    analizar({ id: "lento", a: { ventas: 1, stockInicio: 40, stockCierre: 40 }, b: { ventas: 1, stockInicio: 40, stockCierre: 39 } }),
    analizar({ id: "parado", a: { stockInicio: 12, stockCierre: 12 }, b: { stockInicio: 12, stockCierre: 12 } }),
    analizar({ id: "nd", a: { ventas: 2 }, b: { ventas: 2 } }), // vendió sin stock registrado: rotación y sell-through N/D
    analizar({ id: "baja", a: { ventas: 8, stockInicio: 30, stockCierre: 30 }, b: { ventas: 2, stockInicio: 30, stockCierre: 30 } }),
  ];
  const ids = (o: Parameters<typeof ordenarDesempeno>[1]) => ordenarDesempeno(filas, o).map((x) => x.fila.varianteId);

  it("más vendidos es el orden inicial", () => {
    expect(ids("vendidos")[0]).toBe("top");
    expect(leerVistaDesempeno({}).orden).toBe("vendidos");
  });

  it("mayor ritmo, mayor sell-through y mayor rotación ponen primero al que más vende", () => {
    expect(ids("ritmo")[0]).toBe("top");
    expect(ids("sell_through")[0]).toBe("top");
    expect(ids("rotacion_mayor")[0]).toBe("top");
  });

  it("menor rotación pone primero al que menos rota (el parado, rotación 0) y lo que no se mide siempre al final", () => {
    expect(ids("rotacion_menor")[0]).toBe("parado");
    expect(ids("rotacion_menor").at(-1)).toBe("nd");
    expect(ids("rotacion_mayor").at(-1)).toBe("nd");
  });

  it("aceleración y desaceleración usan la tendencia; sin tendencia, al final", () => {
    const filasT = [
      analizar({ id: "sube", a: { ventas: 3, stockInicio: 30, stockCierre: 30 }, b: { ventas: 9, stockInicio: 30, stockCierre: 30 } }),
      analizar({ id: "baja", a: { ventas: 9, stockInicio: 30, stockCierre: 30 }, b: { ventas: 3, stockInicio: 30, stockCierre: 30 } }),
      analizar({ id: "sin", a: { ventas: 1, stockInicio: 30, stockCierre: 30 }, b: { ventas: 1, stockInicio: 30, stockCierre: 30 } }),
    ];
    expect(ordenarDesempeno(filasT, "aceleracion").map((x) => x.fila.varianteId)).toEqual(["sube", "baja", "sin"]);
    expect(ordenarDesempeno(filasT, "desaceleracion").map((x) => x.fila.varianteId)).toEqual(["baja", "sube", "sin"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const copia = filas.map((x) => x.fila.varianteId);
    ordenarDesempeno(filas, "rotacion_menor");
    expect(filas.map((x) => x.fila.varianteId)).toEqual(copia);
  });

  it("el filtro de sell-through usa las mismas bandas del Resumen (alto ≥ 60%, bajo < 20%, sin dato)", () => {
    const alto = filtrarPorSellThrough(filas, "alto").map((x) => x.fila.varianteId);
    const bajo = filtrarPorSellThrough(filas, "bajo").map((x) => x.fila.varianteId);
    const sinDato = filtrarPorSellThrough(filas, "sin_dato").map((x) => x.fila.varianteId);
    expect(alto).toContain("top"); // 30 vendidas de 30 disponibles
    expect(bajo).toContain("lento");
    expect(sinDato).toContain("nd");
    expect(filtrarPorSellThrough(filas, "todos")).toHaveLength(filas.length);
  });

  it("una URL vieja (`orden=prioridad`, `cob=…`, `est=…`) no rompe: cae en los valores iniciales", () => {
    expect(leerVistaDesempeno({ orden: "prioridad", cob: "critica", est: "agotada_demanda" })).toMatchObject({ orden: "vendidos", sellThrough: "todos" });
    expect(leerVistaDesempeno({ orden: "rotacion_menor", st: "bajo", pag: "3", cat: "c9", q: "blusa" })).toMatchObject({ orden: "rotacion_menor", sellThrough: "bajo", pagina: 3, alcance: { categoriaId: "c9", q: "blusa" } });
  });
});

describe("armarDesempeno", () => {
  const ahora = new Date("2026-10-05T15:00:00Z"); // 5 oct. en Lima
  const params = { preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-30" };
  const filas = [
    fila({ id: "v1", referencia: "Casaca Luciana", categoriaId: "c1", a: { ventas: 3, entradas: 10, stockInicio: 10, stockCierre: 8 }, b: { ventas: 6, stockInicio: 8, stockCierre: 2 } }),
    fila({ id: "v2", referencia: "Blusa Emma", categoriaId: "c2", a: { ventas: 1, stockInicio: 30, stockCierre: 30 }, b: { ventas: 1, stockInicio: 30, stockCierre: 30 } }),
    fila({ id: "v3", referencia: "Blusa Ana", categoriaId: "c2", ledger: false, a: { ventas: 2, stockInicio: 5, stockCierre: 5 }, b: { ventas: 2, stockInicio: 5, stockCierre: 5 } }),
  ];
  const armar = (extra: Record<string, string> = {}, f = filas) =>
    armarDesempeno({ filas: f, ubicacion: { id: "u1", nombre: "Tienda Trujillo", tipo: "tienda" }, params: { ...params, ...extra }, ahora, conteos: { exactitud: null, ultimoCerradoEn: null } });

  it("pide las dos mitades de ESE período y dice si hay tendencia", () => {
    const { periodo, mitades } = mitadesDelDesempeno(params, ahora);
    expect(periodo).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", dias: 30 });
    expect(mitades.primera).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(mitades.segunda).toEqual({ desde: "2026-09-16", hasta: "2026-09-30" });
    expect(armar().tendenciaDisponible).toBe(true);
    expect(armar({ preset: "personalizado", desde: "2026-09-19", hasta: "2026-09-19" }).tendenciaDisponible).toBe(false);
  });

  it("ordena por más vendidos por defecto y respeta el orden pedido", () => {
    expect(armar().tabla.filas.map((x) => x.fila.varianteId)[0]).toBe("v1");
    expect(armar({ orden: "rotacion_menor" }).tabla.filas.map((x) => x.fila.varianteId)[0]).toBe("v2");
  });

  it("categoría y búsqueda recortan la tabla, no el selector de categorías", () => {
    const r = armar({ cat: "c2" });
    expect(r.tabla.totalAlcance).toBe(2);
    expect(r.categorias.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(armar({ q: "luciana" }).tabla.total).toBe(1);
    expect(armar({ q: "nada que coincida" }).tabla.total).toBe(0);
  });

  it("pagina de a 15 y nunca se sale de rango", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => fila({ id: `x${i}`, referencia: `Prenda ${i}`, a: { ventas: i }, b: { ventas: i } }));
    expect(armar({}, muchas).tabla).toMatchObject({ pagina: 1, paginas: 3, total: 40 });
    expect(armar({ pag: "3" }, muchas).tabla.filas).toHaveLength(10);
    expect(armar({ pag: "99" }, muchas).tabla.pagina).toBe(3);
  });

  it("cuenta las variantes con historial que no cuadra (cifras estimadas)", () => {
    expect(armar().estimadas).toBe(1);
  });

  it("todo lo numérico que viaja a la pantalla es finito o null", () => {
    const revisar = (v: unknown): void => {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(revisar);
      else if (v && typeof v === "object") Object.values(v).forEach(revisar);
    };
    revisar(armar());
    revisar(armar({}, [fila({ id: "vacia" }), fila({ id: "solo-ventas", a: { ventas: 3 } })]));
  });
});

describe("cifras y gráficos de Desempeño (rediseño 2026-09-22)", () => {
  const v1 = fila({ id: "v1", a: { ventas: 3, entradas: 10, stockInicio: 10, stockCierre: 8 }, b: { ventas: 6, stockInicio: 8, stockCierre: 2 } });
  const v2 = fila({ id: "v2", a: { ventas: 1, stockInicio: 30, stockCierre: 30 }, b: { ventas: 1, stockInicio: 30, stockCierre: 30 } });
  const v3 = fila({ id: "v3", ledger: false, a: { ventas: 2, stockInicio: 5, stockCierre: 5 }, b: { ventas: 2, stockInicio: 5, stockCierre: 5 } });
  const todas = [v1, v2, v3].map((f) => analizarDesempeno(f, M30));

  it("ventas: lo cobrado del período y el cambio de la 2.ª mitad POR DÍA", () => {
    const k = calcularKpisDesempeno([analizarDesempeno(fila({ a: { ventas: 3, importe: 150 }, b: { ventas: 6, importe: 300 } }), M30)], M30);
    expect(k.ventas).toMatchObject({ importe: 450, unidades: 9, primeraMitad: 150, segundaMitad: 300, cambioMitadPct: 100 });
    // 7 días: 3 + 4. Lo mismo por día en las dos mitades no es «+33 %».
    const m7 = dividirPeriodo({ desde: "2026-09-24", hasta: "2026-09-30" });
    expect(calcularKpisDesempeno([analizarDesempeno(fila({ a: { ventas: 3, importe: 30 }, b: { ventas: 4, importe: 40 } }), m7)], m7).ventas.cambioMitadPct).toBeCloseTo(0);
    // Un solo día: no hay mitades que comparar.
    const m1 = dividirPeriodo({ desde: "2026-09-30", hasta: "2026-09-30" });
    expect(calcularKpisDesempeno([analizarDesempeno(fila({ b: { ventas: 2, importe: 20 } }), m1)], m1).ventas.cambioMitadPct).toBeNull();
  });

  it("sell-through del conjunto: la fórmula de cada variante sobre las sumas, sin las estimadas", () => {
    const st = calcularKpisDesempeno(todas, M30).sellThrough;
    expect(st).toMatchObject({ vendidas: 11, disponibles: 50, variantes: 2, excluidas: 1 }); // 40 al inicio + 10 que entraron
    expect(st.pct).toBeCloseTo(22, 1);
  });

  it("capital al costo al inicio y al cierre; con un costo alterado no se afirma en soles", () => {
    expect(calcularKpisDesempeno(todas, M30).capital).toMatchObject({ verificado: true, inicio: 45 * COSTO, cierre: 37 * COSTO, unidadesInicio: 45, unidadesCierre: 37 });
    const alterada = analizarDesempeno({ ...v2, estadoCosto: "alterado" }, M30);
    expect(calcularKpisDesempeno([alterada], M30).capital).toMatchObject({ verificado: false, alterado: 1, sinCosto: 0 });
  });

  it("la dona cuenta tendencias; lo que no se puede afirmar queda fuera", () => {
    expect(contarTendencias([todas[0]!, todas[1]!])).toEqual({ total: 1, alza: 1, estable: 0, baja: 0, sinDato: 1 });
  });

  it("top rotación: solo rotación calculable y mayor que cero, de mayor a menor", () => {
    const r = rankingRotacionDesempeno(todas);
    expect(r.map((x) => x.fila.varianteId)).toEqual(["v1", "v2"]);
    expect(r.every((x) => (x.periodo.rotacion ?? 0) > 0)).toBe(true);
  });

  it("distribución de sell-through en los rangos de siempre, sin las que no se pueden medir", () => {
    const d = distribucionDesempeno(todas);
    expect(d.rangos.map((r) => r.n)).toEqual([1, 1, 0, 0]);
    expect(d.sinDato).toBe(1);
  });

  it("la banda de sell-through recorta la tabla, nunca las cifras ni los gráficos", () => {
    const armar = (extra: Record<string, string>) =>
      armarDesempeno({ filas: [v1, v2, v3], ubicacion: { id: "u1", nombre: "Tienda Trujillo", tipo: "tienda" }, params: { preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-30", ...extra }, ahora: new Date("2026-10-05T15:00:00Z"), conteos: { exactitud: null, ultimoCerradoEn: null } });
    const todo = armar({});
    const bajo = armar({ st: "bajo" });
    expect(bajo.tabla.total).toBeLessThan(todo.tabla.total);
    expect(bajo.kpis).toEqual(todo.kpis);
    expect(bajo.tendencias).toEqual(todo.tendencias);
    expect(bajo.distribucion).toEqual(todo.distribucion);
  });
});
