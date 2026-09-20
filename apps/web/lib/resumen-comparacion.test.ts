import { describe, expect, it } from "vitest";
import {
  analizarVarianteComparacion,
  armarComparacion,
  cambioMostrado,
  contarCambios,
  detalleCambio,
  distribucionSellThrough,
  evolucionDelRitmo,
  evolucionRitmoTotal,
  filtrarPorCambio,
  leerVistaComparacion,
  mapearFilaComparacion,
  mejoroRotacion,
  metricasDePeriodo,
  ordenarComparacion,
  pideComparacion,
  rangosDeLaComparacion,
  rankingRotacion,
  rangoDeSellThrough,
  textoCambio,
  textoRangoSellThrough,
  variacionPct,
  calcularKpis,
  type AnalisisComparacion,
  type DatosPeriodo,
  type FilaComparacion,
  type OrdenComparacion,
} from "./resumen-comparacion";

// Las fórmulas de la comparación A vs B. Lo que importa: que el stock «al cierre» no se confunda con
// ventas, que el ritmo y el sell-through usen las definiciones canónicas, que un cambio relevante sea
// UNO por variante (el más importante de los que aplican) y que un dato que falta salga como N/D — o
// null cuando no hay NADA que afirmar— y nunca como NaN/Infinity.

// Costo unitario de las variantes de prueba. `periodo()` deriva el costo de lo vendido y de lo devuelto de él
// (lo que haría `registrar_venta`), salvo que el caso lo fije a mano para que el costo de ese día ≠ el de hoy.
const COSTO = 40;
const periodo = (o: Partial<DatosPeriodo> = {}): DatosPeriodo => ({ ventas: 0, devoluciones: 0, importe: 0, costoVentas: COSTO * (o.ventas ?? 0), costoDevoluciones: COSTO * (o.devoluciones ?? 0), unidadesSinCosto: 0, entradas: 0, stockInicio: 0, stockCierre: 0, diasConStock: 30, ...o });
/** Lo que de la fila necesita `metricasDePeriodo`: historial fiable y un costo verificable. */
const F = { ledgerConsistente: true, costo: COSTO, estadoCosto: "oficial" as const };

function fila(o: { id?: string; referencia?: string; categoriaId?: string; costo?: number | null; estadoCosto?: FilaComparacion["estadoCosto"]; ledger?: boolean; a?: Partial<DatosPeriodo>; b?: Partial<DatosPeriodo> } = {}): FilaComparacion {
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
    costo: o.costo === undefined ? COSTO : o.costo,
    estadoCosto: o.estadoCosto === undefined ? "oficial" : o.estadoCosto,
    ledgerConsistente: o.ledger ?? true,
    a: periodo(o.a),
    b: periodo(o.b),
  };
}

const analizar = (o: Parameters<typeof fila>[0] = {}, diasA = 30, diasB = 30) => analizarVarianteComparacion(fila(o), diasA, diasB);

describe("metricasDePeriodo", () => {
  it("uds/día = ventas netas ÷ días con stock", () => {
    // Vendió 18 en 30 días con stock: 0.6 uds/día.
    const m = metricasDePeriodo(periodo({ ventas: 18, stockInicio: 14, stockCierre: 9 }), 30, F);
    expect(m.unidadesDia).toBeCloseTo(0.6, 5);
  });

  it("sell-through = ventas netas ÷ (stock al inicio + entradas)", () => {
    const m = metricasDePeriodo(periodo({ ventas: 9, stockInicio: 14, entradas: 4 }), 30, F);
    expect(m.sellThrough).toBeCloseTo(50, 5); // 9 ÷ (14 + 4) = 50%
    expect(metricasDePeriodo(periodo({ ventas: 30, stockInicio: 10 }), 30, F).sellThrough).toBe(100); // nunca pasa de 100%
  });

  it("los días SIN stock no castigan la velocidad: 10 vendidas en 5 días con stock = 2/día, no 0.33", () => {
    const m = metricasDePeriodo(periodo({ ventas: 10, diasConStock: 5, stockCierre: 4 }), 30, F);
    expect(m.unidadesDia).toBeCloseTo(2, 5);
  });

  it("inicio → cierre NO es ventas: el stock puede SUBIR aunque se haya vendido", () => {
    const m = metricasDePeriodo(periodo({ ventas: 4, stockInicio: 0, stockCierre: 14 }), 15, F);
    expect(m.ventasNetas).toBe(4); // sale de las ventas, no de restar 14 − 0
    expect(m.stockInicio).toBe(0);
    expect(m.stockCierre).toBe(14);
  });

  it("las devoluciones restan y nunca dan ventas negativas", () => {
    expect(metricasDePeriodo(periodo({ ventas: 5, devoluciones: 2 }), 30, F).ventasNetas).toBe(3);
    expect(metricasDePeriodo(periodo({ ventas: 1, devoluciones: 4 }), 30, F).ventasNetas).toBe(0);
  });

  it("rotación = COGS ÷ inventario promedio a costo, con (valor al inicio + valor al cierre) ÷ 2", () => {
    // 18 vendidas a 40 = COGS 720; inventario: (14×40 + 9×40) ÷ 2 = 460 → 720 ÷ 460.
    const m = metricasDePeriodo(periodo({ ventas: 18, stockInicio: 14, stockCierre: 9 }), 30, F);
    expect(m.rotacion).toBeCloseTo(720 / 460, 5);
    expect(m.motivoSinRotacion).toBeNull();
  });

  it("la rotación es plata a costo, no la razón de unidades", () => {
    const m = metricasDePeriodo(periodo({ ventas: 18, costoVentas: 15 * 40, stockInicio: 14, stockCierre: 9 }), 30, F);
    expect(m.rotacion).toBeCloseTo(600 / 460, 5);
    expect(m.rotacion).not.toBeCloseTo(18 / 11.5, 2); // la razón de unidades daría otra cosa
  });

  it("inventario promedio 0: rotación N/D; sin costo verificable en ventas o stock, también N/D", () => {
    const m = metricasDePeriodo(periodo({ ventas: 5, stockInicio: 10, stockCierre: 10 }), 30, F);
    expect(m.rotacion).toBeCloseTo(200 / 400, 5);
    const sinCostoVenta = metricasDePeriodo(periodo({ ventas: 5, unidadesSinCosto: 5, stockInicio: 10, stockCierre: 10 }), 30, F);
    expect(sinCostoVenta.rotacion).toBeNull();
    expect(sinCostoVenta.motivoSinRotacion).toBe("ventas_sin_costo");
    const sinCostoStock = metricasDePeriodo(periodo({ ventas: 5, stockInicio: 10, stockCierre: 10 }), 30, { ...F, costo: null, estadoCosto: "sin_costo" });
    expect(sinCostoStock.rotacion).toBeNull();
    expect(sinCostoStock.motivoSinRotacion).toBe("inventario_sin_valor");
    expect(metricasDePeriodo(periodo({ ventas: 5, stockInicio: 10, stockCierre: 10 }), 30, { ...F, estadoCosto: "alterado" }).rotacion).toBeNull();
  });

  it("con el historial de movimientos inconsistente el stock al inicio no es fiable: rotación N/D", () => {
    expect(metricasDePeriodo(periodo({ ventas: 5, stockInicio: 10, stockCierre: 10 }), 30, { ...F, ledgerConsistente: false }).rotacion).toBeNull();
  });

  it("producto sin ventas pero con inventario: rota 0 veces (dato, no N/D)", () => {
    expect(metricasDePeriodo(periodo({ stockInicio: 6, stockCierre: 6 }), 30, F).rotacion).toBe(0);
  });

  it("un stock reconstruido negativo se trata como 0", () => {
    const m = metricasDePeriodo(periodo({ ventas: 2, stockInicio: -3, stockCierre: -1 }), 30, F);
    expect(m.stockInicio).toBe(0);
    expect(m.stockCierre).toBe(0);
  });

  it("con el ledger inconsistente la velocidad cae a los días del período y queda estimada", () => {
    const m = metricasDePeriodo(periodo({ ventas: 15, diasConStock: 3, stockCierre: 30 }), 30, { ...F, ledgerConsistente: false });
    expect(m.velocidad.estimada).toBe(true);
    expect(m.unidadesDia).toBeCloseTo(0.5, 5);
  });

  it("nunca produce NaN ni Infinity", () => {
    const casos = [periodo(), periodo({ ventas: 3 }), periodo({ stockCierre: 4, diasConStock: 0 }), periodo({ ventas: 2, diasConStock: 0, stockInicio: 1 }), periodo({ diasConStock: null, ventas: 1, stockCierre: 2 })];
    for (const d of casos) {
      const m = metricasDePeriodo(d, 30, F);
      for (const v of [m.unidadesDia, m.rotacion, m.sellThrough]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("variacionPct", () => {
  it("(después − antes) ÷ antes; sin base o sin dato no hay porcentaje", () => {
    expect(variacionPct(18, 27)).toBeCloseTo(50, 5);
    expect(variacionPct(0, 5)).toBeNull();
    expect(variacionPct(null, 5)).toBeNull();
    expect(variacionPct(5, null)).toBeNull();
  });
});

describe("evolución del ritmo (A → B)", () => {
  const m = (o: Partial<DatosPeriodo>) => metricasDePeriodo(periodo(o), 30, F);

  it("sube 25% o más: aceleró; baja 25% o más: desaceleró; si no, estable", () => {
    expect(evolucionDelRitmo(m({ ventas: 4 }), m({ ventas: 12 }))).toMatchObject({ direccion: "acelero" }); // 0.13 → 0.4/día, +200%
    expect(evolucionDelRitmo(m({ ventas: 12 }), m({ ventas: 4 }))).toMatchObject({ direccion: "desacelero" });
    expect(evolucionDelRitmo(m({ ventas: 10 }), m({ ventas: 11 }))).toMatchObject({ direccion: "estable" }); // +10%
  });

  it("con menos de 4 unidades netas EN TOTAL no se afirma nada (evidencia, no umbral de cambio)", () => {
    expect(evolucionDelRitmo(m({ ventas: 1 }), m({ ventas: 2 }))).toBeNull(); // 3 en total
    expect(evolucionDelRitmo(m({ ventas: 2 }), m({ ventas: 2 }))).toMatchObject({ direccion: "estable" }); // 4 en total: ya alcanza
  });

  it("sin base honesta en A (muy poco historial) no hay tendencia que afirmar: null, no Infinity", () => {
    expect(evolucionDelRitmo(m({ ventas: 0, diasConStock: 1 }), m({ ventas: 6 }))).toBeNull();
  });
});

describe("mejoroRotacion", () => {
  it("sube TENDENCIA_UMBRAL_PCT (25%) o más, o pasa de no rotar a rotar", () => {
    const m = (rot: number | null) => ({ ...metricasDePeriodo(periodo({ ventas: 5, stockInicio: 5, stockCierre: 5 }), 30, F), rotacion: rot });
    expect(mejoroRotacion(m(1), m(1.25))).toBe(true);
    expect(mejoroRotacion(m(1), m(1.2))).toBe(false);
    expect(mejoroRotacion(m(0), m(0.4))).toBe(true);
    expect(mejoroRotacion(m(null), m(2))).toBe(false); // sin base en A no hay mejora que afirmar
    expect(mejoroRotacion(m(2), m(null))).toBe(false);
    expect(mejoroRotacion(m(2), m(1))).toBe(false);
  });
});

describe("cambio relevante: UNO por variante, el más importante", () => {
  it("una variante puede cumplir varios cambios; sin filtro se muestra el más importante (ritmo > rotación > sell-through)", () => {
    const sube = analizar({ id: "sube", a: { ventas: 4, stockInicio: 20, stockCierre: 20 }, b: { ventas: 16, stockInicio: 20, stockCierre: 20 } });
    expect(sube.cambios).toEqual(["acelero", "mejoro_rotacion", "sell_through_sube"]);
    expect(sube.medible).toBe(true);
    expect(cambioMostrado(sube)).toBe("acelero");
    expect(textoCambio(sube, "acelero")).toBe("Aceleró");
    expect(textoCambio(sube, "sell_through_sube")).toBe("Sell-through +60 pp");
    expect(detalleCambio(sube, "acelero")).toContain("uds/día");
  });

  it("con un filtro activo que la variante cumple, se muestra ESE cambio; uno que no cumple no cambia nada", () => {
    const sube = analizar({ id: "sube", a: { ventas: 4, stockInicio: 20, stockCierre: 20 }, b: { ventas: 16, stockInicio: 20, stockCierre: 20 } });
    expect(cambioMostrado(sube, "mejoro_rotacion")).toBe("mejoro_rotacion");
    expect(cambioMostrado(sube, "desacelero")).toBe("acelero"); // no aplica: sigue el más importante
  });

  it("sin ningún cambio pero con datos medibles: «sin cambio relevante», nunca N/D", () => {
    const quieta = analizar({ id: "quieta", a: { ventas: 10, stockInicio: 20, stockCierre: 20 }, b: { ventas: 10, stockInicio: 20, stockCierre: 20 } });
    expect(quieta.cambios).toEqual([]);
    expect(quieta.medible).toBe(true);
    expect(cambioMostrado(quieta)).toBe("sin_cambio");
  });

  it("sin NINGUNA métrica medible (ledger inconsistente y muy poca venta): null, distinto de «sin cambio»", () => {
    const sinDato = analizar({ id: "nd", ledger: false, a: { ventas: 1, stockCierre: 2 }, b: { ventas: 1, stockCierre: 2 } });
    expect(sinDato.medible).toBe(false);
    expect(cambioMostrado(sinDato)).toBeNull();
  });
});

describe("calcularKpis", () => {
  const dos = () => [
    analizar({ id: "v1", costo: 40, a: { ventas: 10, importe: 1000, costoVentas: 400, stockInicio: 20, stockCierre: 20 }, b: { ventas: 20, importe: 2000, costoVentas: 800, stockInicio: 20, stockCierre: 10 } }),
    analizar({ id: "v2", costo: 100, a: { ventas: 2, importe: 500, costoVentas: 200, stockInicio: 4, stockCierre: 4 }, b: { ventas: 1, importe: 250, costoVentas: 100, stockInicio: 4, stockCierre: 8 } }),
  ];

  it("ventas: importe de A y de B, con su variación y las unidades detrás", () => {
    const k = calcularKpis(dos());
    expect(k.ventas).toMatchObject({ a: 1500, b: 2250, unidadesA: 12, unidadesB: 21 });
    expect(k.ventas.deltaPct).toBeCloseTo(50, 5);
  });

  it("capital = stock al cierre × costo, en A y en B", () => {
    const k = calcularKpis(dos());
    expect(k.capital.verificado).toBe(true);
    expect(k.capital.a).toBe(20 * 40 + 4 * 100); // 1200
    expect(k.capital.b).toBe(10 * 40 + 8 * 100); // 1200
    expect(k.capital.delta).toBe(0);
  });

  it("rotación total a costo = costo vendido ÷ inventario promedio a costo (no el promedio de las rotaciones)", () => {
    const k = calcularKpis(dos());
    // A: COGS 600 ÷ ((20·40+4·100 + 20·40+4·100) / 2 = 1200) = 0.5 · B: 900 ÷ ((1200 + 1200) / 2) = 0.75
    expect(k.rotacion).toMatchObject({ variantesExcluidas: 0 });
    expect(k.rotacion.a).toBeCloseTo(0.5, 5);
    expect(k.rotacion.b).toBeCloseTo(0.75, 5);
    expect(k.rotacion.deltaPct).toBeCloseTo(50, 5);
  });

  it("sell-through total: LA MISMA fórmula sobre la suma de ventas, stock inicial y entradas de las variantes comparables", () => {
    const k = calcularKpis(dos());
    // A: (10+2) ÷ (20+4) = 50% · B: (20+1) ÷ (20+4) = 87.5%
    expect(k.sellThrough).toMatchObject({ totalVariantes: 2, variantesComparables: 2, variantesExcluidas: 0 });
    expect(k.sellThrough.a).toBeCloseTo(50, 5);
    expect(k.sellThrough.b).toBeCloseTo(87.5, 5);
    expect(k.sellThrough.deltaPp).toBeCloseTo(37.5, 5);
  });

  it("con costos que no se pueden verificar el capital pasa a unidades y la rotación de esa variante es N/D; el sell-through no depende del costo", () => {
    const k = calcularKpis([analizar({ costo: null, estadoCosto: "sin_costo", a: { ventas: 10, stockInicio: 10, stockCierre: 10 }, b: { ventas: 20, stockInicio: 10, stockCierre: 10 } })]);
    expect(k.capital.verificado).toBe(false);
    expect(k.capital.sinCosto).toBe(1);
    expect(k.capital.unidadesA).toBe(10);
    expect(k.rotacion).toMatchObject({ a: null, b: null, variantesValidas: 0, variantesExcluidas: 1 });
    expect(k.sellThrough).toMatchObject({ variantesComparables: 1, variantesExcluidas: 0 });
  });

  it("un costo alterado también impide afirmar el capital", () => {
    const k = calcularKpis([analizar({ estadoCosto: "alterado", a: { stockCierre: 3, stockInicio: 3 } })]);
    expect(k.capital.verificado).toBe(false);
    expect(k.capital.alterado).toBe(1);
  });

  it("sin ventas pero con stock, el sell-through es 0% (es un dato, no N/D)", () => {
    const k = calcularKpis([analizar({ a: { stockInicio: 5, stockCierre: 5 }, b: { stockInicio: 5, stockCierre: 5 } })]);
    expect(k.sellThrough.a).toBe(0);
    expect(k.sellThrough.b).toBe(0);
  });

  it("sin datos todo es N/D (null), nunca NaN ni Infinity", () => {
    const k = calcularKpis([]);
    expect(k.rotacion).toMatchObject({ a: null, b: null, deltaPct: null });
    expect(k.sellThrough).toMatchObject({ a: null, b: null, deltaPp: null, totalVariantes: 0 });
    expect(k.ventas).toEqual({ a: 0, b: 0, deltaPct: null, unidadesA: 0, unidadesB: 0 });
  });
});

describe("evolución del ritmo total (para la dona)", () => {
  it("cuenta cada variante en su categoría y deja las que no se pueden medir en «sinDato»", () => {
    const analisis = [
      analizar({ id: "1", a: { ventas: 4, stockInicio: 20, stockCierre: 20 }, b: { ventas: 16, stockInicio: 20, stockCierre: 20 } }), // acelero
      analizar({ id: "2", a: { ventas: 10, stockInicio: 20, stockCierre: 20 }, b: { ventas: 10, stockInicio: 20, stockCierre: 20 } }), // estable
      analizar({ id: "3", a: { ventas: 16, stockInicio: 20, stockCierre: 20 }, b: { ventas: 4, stockInicio: 20, stockCierre: 20 } }), // desacelero
      analizar({ id: "4", ledger: false, a: { ventas: 1, stockCierre: 2 }, b: { ventas: 1, stockCierre: 2 } }), // sin dato
    ];
    expect(evolucionRitmoTotal(analisis)).toEqual({ total: 3, acelero: 1, estable: 1, desacelero: 1, sinDato: 1 });
  });

  it("sin variantes, todo en cero (nunca NaN)", () => {
    expect(evolucionRitmoTotal([])).toEqual({ total: 0, acelero: 0, estable: 0, desacelero: 0, sinDato: 0 });
  });
});

describe("distribución de sell-through", () => {
  it("los rangos: 0–25 | 26–50 | 51–75 | 76–100, redondeando al entero antes de ubicar", () => {
    expect(rangoDeSellThrough(0)).toBe(0);
    expect(rangoDeSellThrough(25)).toBe(0);
    expect(rangoDeSellThrough(25.4)).toBe(0); // redondea a 25
    expect(rangoDeSellThrough(25.5)).toBe(1); // redondea a 26
    expect(rangoDeSellThrough(50)).toBe(1);
    expect(rangoDeSellThrough(75)).toBe(2);
    expect(rangoDeSellThrough(100)).toBe(3);
  });

  it("los textos de cada rango", () => {
    expect([0, 1, 2, 3].map(textoRangoSellThrough)).toEqual(["0–25%", "26–50%", "51–75%", "76–100%"]);
  });

  it("cuenta A y B por separado y deja aparte lo que no tiene sell-through calculable en ese período", () => {
    const analisis = [
      analizar({ id: "1", a: { ventas: 2, stockInicio: 20 }, b: { ventas: 18, stockInicio: 20 } }), // A 10% (r0) · B 90% (r3)
      analizar({ id: "2", a: { ventas: 8, stockInicio: 20 }, b: { ventas: 8, stockInicio: 20 } }), // 40% en los dos (r1)
      analizar({ id: "3", ledger: false, a: { ventas: 1, stockCierre: 2 }, b: { ventas: 1, stockCierre: 2 } }), // ledger inconsistente: sin dato
    ];
    const d = distribucionSellThrough(analisis);
    const por = Object.fromEntries(d.rangos.map((r) => [r.clave, [r.a, r.b]]));
    expect(por).toEqual({ r0: [1, 0], r1: [1, 1], r2: [0, 0], r3: [0, 1] });
    expect(d.sinDato).toEqual({ a: 1, b: 1 });
  });
});

describe("ranking, orden y filtro por cambio", () => {
  const filas: AnalisisComparacion[] = [
    analizar({ id: "sube", referencia: "Sube", a: { ventas: 4, stockInicio: 20, stockCierre: 20 }, b: { ventas: 16, stockInicio: 20, stockCierre: 20 } }),
    analizar({ id: "baja", referencia: "Baja", a: { ventas: 16, stockInicio: 20, stockCierre: 20 }, b: { ventas: 4, stockInicio: 20, stockCierre: 20 } }),
    analizar({ id: "quieta", referencia: "Quieta", a: { ventas: 10, stockInicio: 20, stockCierre: 20 }, b: { ventas: 10, stockInicio: 20, stockCierre: 20 } }),
    analizar({ id: "nd", referencia: "ND", ledger: false, a: { ventas: 1, stockCierre: 2 }, b: { ventas: 1, stockCierre: 2 } }),
  ];

  it("el ranking pone primero la mayor rotación en B y deja fuera lo que no rotó o no se puede medir", () => {
    const ids = rankingRotacion(filas).map((x) => x.fila.varianteId);
    expect(ids[0]).toBe("sube"); // 0.8
    expect(ids).not.toContain("nd");
  });

  it("ordena por más vendidos, crecimiento de ventas, rotación (y su mejora), sell-through (y su mejora) y desaceleración; lo que no se puede medir va al final", () => {
    const ids = (o: OrdenComparacion) => ordenarComparacion(filas, o).map((x) => x.fila.varianteId);
    expect(ids("vendidos_b")[0]).toBe("sube"); // 16 vendidos en B
    expect(ids("crecimiento_ventas")).toEqual(["sube", "quieta", "baja", "nd"]); // +300% · 0% · −75% · sin dato
    expect(ids("rotacion_b")[0]).toBe("sube"); // 0.8
    expect(ids("mejora_rotacion")[0]).toBe("sube");
    expect(ids("sell_through_b")[0]).toBe("sube"); // 80%
    expect(ids("mejora_sell_through")[0]).toBe("sube"); // +60 pp
    expect(ids("desaceleracion")).toEqual(["baja", "quieta", "sube", "nd"]); // la caída más grande primero
  });

  it("no modifica el arreglo que recibe", () => {
    const copia = filas.map((x) => x.fila.varianteId);
    ordenarComparacion(filas, "rotacion_b");
    expect(filas.map((x) => x.fila.varianteId)).toEqual(copia);
  });

  it("filtra por cambio, y los conteos coinciden con la tabla", () => {
    expect(contarCambios(filas)).toEqual({ acelero: 1, estable: 1, desacelero: 1, mejoro_rotacion: 1 });
    expect(filtrarPorCambio(filas, "acelero").map((x) => x.fila.varianteId)).toEqual(["sube"]);
    expect(filtrarPorCambio(filas, "todos")).toHaveLength(filas.length);
  });
});

describe("la URL", () => {
  it("modo: solo «comparar» activa la comparación", () => {
    expect(pideComparacion({ modo: "comparar" })).toBe(true);
    expect(pideComparacion({ modo: "otro" })).toBe(false);
    expect(pideComparacion({})).toBe(false);
  });

  it("vista, cambio y orden: lo que no se reconoce cae en los valores iniciales", () => {
    expect(leerVistaComparacion({})).toMatchObject({ vista: "general", cambio: "todos", orden: "vendidos_b", pagina: 1 });
    expect(leerVistaComparacion({ vista: "detalle", cambio: "desacelero", orden: "rotacion_b", pag: "3" })).toMatchObject({ vista: "detalle", cambio: "desacelero", orden: "rotacion_b", pagina: 3 });
    expect(leerVistaComparacion({ vista: "x", cambio: "x", orden: "prioridad" })).toMatchObject({ vista: "general", cambio: "todos", orden: "vendidos_b" });
  });

  it("A es «comparar con»: período anterior por defecto, «sin comparación» cae en anterior y «otro período» respeta las fechas", () => {
    const ahora = new Date("2026-10-05T15:00:00Z"); // 5 oct. en Lima
    const base = { preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-30" };
    expect(rangosDeLaComparacion(base, ahora).rangoA).toEqual({ desde: "2026-08-02", hasta: "2026-08-31" });
    const ninguna = rangosDeLaComparacion({ ...base, comparar: "ninguna" }, ahora);
    expect(ninguna.rangoA).toEqual({ desde: "2026-08-02", hasta: "2026-08-31" });
    expect(ninguna.modoA).toBe("anterior");
    const otro = rangosDeLaComparacion({ ...base, comparar: "personalizado", cdesde: "2026-07-01", chasta: "2026-07-15" }, ahora);
    expect(otro.rangoA).toEqual({ desde: "2026-07-01", hasta: "2026-07-15" });
    expect(otro.modoA).toBe("personalizado");
    // Fechas inválidas: no se inventa un rango, se cae en «anterior» y el modo lo dice.
    const roto = rangosDeLaComparacion({ ...base, comparar: "personalizado", cdesde: "2026-07-01" }, ahora);
    expect(roto.modoA).toBe("anterior");
    expect(roto.rangoA).toEqual({ desde: "2026-08-02", hasta: "2026-08-31" });
  });
});

describe("armarComparacion", () => {
  const ahora = new Date("2026-10-05T15:00:00Z");
  const params = { modo: "comparar", preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-30", comparar: "personalizado", cdesde: "2026-08-01", chasta: "2026-08-31" };
  const filas = [
    fila({ id: "v1", referencia: "Casaca Luciana", categoriaId: "c1", a: { ventas: 9, importe: 900, stockInicio: 0, stockCierre: 16 }, b: { ventas: 18, importe: 1800, stockInicio: 16, stockCierre: 3 } }),
    fila({ id: "v2", referencia: "Blusa Emma", categoriaId: "c2", a: { ventas: 4, importe: 200, costoVentas: 100, stockInicio: 10, stockCierre: 8 }, b: { ventas: 4, importe: 200, costoVentas: 100, stockInicio: 8, stockCierre: 20 } }),
    fila({ id: "v3", referencia: "Blusa Ana", categoriaId: "c2", ledger: false, a: { ventas: 1, stockCierre: 2 }, b: { ventas: 1, stockCierre: 2 } }),
  ];
  const armar = (extra: Record<string, string> = {}) =>
    armarComparacion({
      filas,
      ubicacion: { id: "u1", nombre: "Tienda Trujillo", tipo: "tienda" },
      params: { ...params, ...extra },
      ahora,
      conteos: { exactitud: null, ultimoCerradoEn: null },
    });

  it("arma los dos períodos con sus fechas y duraciones", () => {
    const r = armar();
    expect(r.periodoA.rango).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(r.periodoA.dias).toBe(31);
    expect(r.periodoA.etiqueta).toBe("1–31 ago.");
    expect(r.periodoB).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", dias: 30, etiquetaCorta: "1–30 sep." });
    expect(r.avisos.join(" ")).toMatch(/duran distinto/); // 31 días contra 30
  });

  it("el conteo de cada cambio coincide con lo que filtra la tabla, y los KPI NO cambian al elegir un cambio", () => {
    const r = armar();
    // v1 aceleró (0.3→0.6 uds/día) y mejoró su rotación; v2 quedó estable; v3 no tiene datos suficientes.
    expect(r.conteoCambios).toMatchObject({ acelero: 1, mejoro_rotacion: 1 });
    for (const c of ["acelero", "desacelero", "mejoro_rotacion"] as const) {
      expect(armar({ cambio: c, vista: "detalle" }).tabla.total).toBe(r.conteoCambios[c]);
    }
    expect(armar({ cambio: "acelero", vista: "detalle" }).kpis).toEqual(r.kpis);
  });

  it("categoría y búsqueda recortan los KPI y la tabla, no el selector de categorías", () => {
    const r = armar({ cat: "c2" });
    expect(r.tabla.totalAlcance).toBe(2);
    expect(r.kpis.ventas.unidadesB).toBe(5);
    expect(r.categorias.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(armar({ q: "luciana" }).tabla.total).toBe(1);
    expect(armar({ q: "nada que coincida" }).tabla.total).toBe(0);
  });

  it("cuenta las variantes con historial que no cuadra (cifras estimadas)", () => {
    expect(armar().estimadas).toBe(1);
  });

  it("mapea una fila cruda con numéricos en texto y nulos sin inventar ceros donde importa", () => {
    const f = mapearFilaComparacion({ variante_id: "v", producto_id: "p", referencia: "X", costo: "40.50", a_importe: "12.30", a_dias_con_stock: null, b_dias_con_stock: "14.509", estado_costo: "raro" });
    expect(f.costo).toBe(40.5);
    expect(f.a.importe).toBe(12.3);
    expect(f.a.diasConStock).toBeNull();
    expect(f.b.diasConStock).toBe(14.509);
    expect(f.estadoCosto).toBeNull();
    expect(f.ledgerConsistente).toBe(true);
  });
});
