import { describe, expect, it } from "vitest";
import { analizarVarianteComparacion, type DatosPeriodo, type EventoPiso, type FilaComparacion } from "./resumen-comparacion";
import { analizarDesempeno, dividirPeriodo, type Mitades } from "./resumen-desempeno";
import { lecturaComparacion, lecturaDesempeno } from "./resumen-lectura";

// La lectura de cada variante: siete reglas en orden y gana la primera. Lo que se prueba es el ORDEN (una
// variante que se agotó y además aceleró dice «se agotó») y que cada regla pida la evidencia que promete.

const COSTO = 40;
// pisoPromedio/totalPromedio por defecto = el promedio de dos puntos de este `o` (no un 0 plano): así el
// camino nuevo (temporal) da el mismo número que el viejo (extremos) en los tests que no lo pisan a propósito.
const periodo = (o: Partial<DatosPeriodo> = {}): DatosPeriodo => {
  const stockInicio = o.stockInicio ?? 0;
  const stockCierre = o.stockCierre ?? 0;
  const promedioExtremos = (stockInicio + stockCierre) / 2;
  return { ventas: 0, devoluciones: 0, importe: 0, costoVentas: COSTO * (o.ventas ?? 0), costoDevoluciones: 0, unidadesSinCosto: 0, entradas: 0, stockInicio, stockCierre, diasConStock: 15, pisoPromedio: promedioExtremos, totalPromedio: promedioExtremos, ...o };
};

function fila(o: { ledger?: boolean; a?: Partial<DatosPeriodo>; b?: Partial<DatosPeriodo>; pisoEventos?: EventoPiso[] } = {}): FilaComparacion {
  const a = periodo(o.a);
  const b = periodo(o.b);
  // Por defecto (si el test no fija `pisoEventos` a propósito): UNA sola cohorte vieja —ya madura pase lo
  // que pase— con el stock inicial de la 1.ª mitad, de la que se vendió lo neto del período. Así el
  // sell-through DE EXPOSICIÓN da el mismo % que el sell-through clásico habría dado, y estos tests (que
  // prueban el ORDEN de las reglas, no el detalle de cohortes — eso lo prueba `resumen-exposicion.test.ts`)
  // no tienen que fabricar eventos a mano.
  const ventasNetas = Math.max(a.ventas - a.devoluciones, 0) + Math.max(b.ventas - b.devoluciones, 0);
  const pisoEventos: EventoPiso[] =
    o.pisoEventos ??
    (a.stockInicio > 0
      ? [{ ts: "2020-01-01T00:00:00Z", delta: a.stockInicio, esVenta: false, esMovimientoInterno: false }, ...(ventasNetas > 0 ? [{ ts: "2020-01-02T00:00:00Z", delta: -ventasNetas, esVenta: true, esMovimientoInterno: false }] : [])]
      : []);
  return {
    varianteId: "v1",
    productoId: "p1",
    productoCodigo: null,
    productoEstado: "activo",
    referencia: "Blusa Emma",
    categoriaId: "c1",
    categoria: "Blusas",
    sku: "BE-NE-S",
    codigo: null,
    codigosBarras: [],
    talla: "S",
    colorCodigo: "NE",
    color: "Negro",
    colorHex: null,
    costo: COSTO,
    estadoCosto: "oficial",
    ledgerConsistente: o.ledger ?? true,
    a,
    b,
    ultimaVentaEn: null,
    pisoExpuestoDesdeUltimaVentaDias: null,
    pisoEventos,
    stockActualPisoAlmacen: null,
  };
}

const M30: Mitades = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" });
const M7: Mitades = dividirPeriodo({ desde: "2026-09-24", hasta: "2026-09-30" });
const des = (o: Parameters<typeof fila>[0], m: Mitades = M30) => lecturaDesempeno(analizarDesempeno(fila(o), m), m.dias);
const cmp = (o: Parameters<typeof fila>[0], diasB = 30) => lecturaComparacion(analizarVarianteComparacion(fila(o), 30, diasB), diasB);

describe("lecturaDesempeno: las 7 categorías canónicas de Felipe (A–G, sección 22, 2026-09-24), gana la primera", () => {
  it("1 · un historial que no cuadra no afirma nada más: cifras estimadas", () => {
    expect(des({ ledger: false, a: { ventas: 5, stockInicio: 10 }, b: { ventas: 5, stockCierre: 0 } })).toMatchObject({ regla: "estimada", tono: "ambar" });
  });

  it("F · Reposición reciente: todo el piso de hoy es una cohorte sin madurar — no hay base para leer el período todavía", () => {
    const f = fila({ a: { stockInicio: 0, stockCierre: 0 }, b: { stockCierre: 10 } });
    f.pisoEventos = [{ ts: "2026-09-29T00:00:00Z", delta: 10, esVenta: false, esMovimientoInterno: false }]; // entró un día antes del cierre de M30
    expect(lecturaDesempeno(analizarDesempeno(f, M30), M30.dias)).toMatchObject({ regla: "reposicion_reciente", texto: "La reposición reciente aún no tuvo exposición suficiente para evaluarse", tono: "neutro" });
  });

  it("E · Agotamiento: vendió y cerró en 0, con exposición suficiente — texto plano, sin la salvedad de demanda censurada", () => {
    const l = des({ a: { ventas: 2, stockInicio: 10 }, b: { ventas: 8, stockCierre: 0 } });
    expect(l).toMatchObject({ regla: "agotada", tono: "rojo", texto: "Se agotó: pendiente reponer" });
  });

  it("E · Agotamiento con muestra limitada: el texto avisa que la demanda pudo estar limitada por stock — nunca se afirma como demanda plena", () => {
    const f = fila({ a: { ventas: 2, diasConStock: 1, stockInicio: 5, stockCierre: 3 }, b: { ventas: 6, diasConStock: 1, stockCierre: 0 } });
    const l = lecturaDesempeno(analizarDesempeno(f, M30), M30.dias);
    expect(l).toMatchObject({ regla: "agotada", texto: "Se agotó rápidamente; la demanda pudo estar limitada por stock" });
    expect(l?.detalle).toMatch(/pudo quedar corto/);
  });

  it("C · Estancamiento: exposición YA suficiente, mucho tiempo EXPUESTA SIN VENDER (no calendario), con stock, cero ventas", () => {
    const f = fila({ a: { stockInicio: 30 }, b: { stockCierre: 30 } });
    f.pisoExpuestoDesdeUltimaVentaDias = 20; // ≥ LECTURA_SIN_VENTAS_DIAS_MIN
    const l = lecturaDesempeno(analizarDesempeno(f, M30), M30.dias);
    expect(l).toMatchObject({ regla: "estancamiento", texto: "Riesgo de estancamiento: mucha exposición y poco movimiento", tono: "ambar" });
  });

  it("C · Estancamiento también dispara con POCO movimiento (no solo cero ventas): sell-through de exposición bajo con stock relevante", () => {
    const f = fila({ a: { ventas: 1, stockInicio: 40 }, b: { ventas: 1, stockCierre: 38 } });
    f.pisoExpuestoDesdeUltimaVentaDias = 20;
    expect(lecturaDesempeno(analizarDesempeno(f, M30), M30.dias)?.regla).toBe("estancamiento");
  });

  it("...pero con pocas unidades, un sell-through bajo por sí solo no alcanza para Estancamiento (con 3 prendas no hay capital parado que mover)", () => {
    const f = fila({ a: { ventas: 1, stockInicio: 12 }, b: { ventas: 0, stockCierre: 11 } });
    f.pisoExpuestoDesdeUltimaVentaDias = 20;
    expect(lecturaDesempeno(analizarDesempeno(f, M30), M30.dias)?.regla).not.toBe("estancamiento");
  });

  it("C vs. D: con exposición CORTA (muestra limitada) no es Estancamiento, es Problema de reposición — la evidencia no alcanza para «estancada»", () => {
    const f = fila({ a: { stockInicio: 30, diasConStock: 1 }, b: { stockCierre: 30, diasConStock: 1 } }); // 2 de 7 días: muestra limitada
    expect(lecturaDesempeno(analizarDesempeno(f, M7), M7.dias)?.regla).toBe("problema_reposicion");
  });

  it("A · Saludable: ritmo sostenido, exposición suficiente, sin tendencia a la baja", () => {
    const l = des({ a: { ventas: 3, stockInicio: 20 }, b: { ventas: 3, stockCierre: 14 } });
    expect(l).toMatchObject({ regla: "saludable", texto: "Salida sostenida y mantiene velocidad", tono: "verde" });
  });

  it("sin cambio relevante: ritmo confiablemente cero (exposición completa, nada vendido), sin otra señal de estancamiento ni sobrestock", () => {
    const l = des({ a: { stockInicio: 20, stockCierre: 20 }, b: { stockCierre: 20 } });
    expect(l).toMatchObject({ regla: "sin_cambio", tono: "neutro" });
  });

  it("G · Datos insuficientes: nada calculable — nunca una celda vacía sin explicar", () => {
    const l = des({ a: { diasConStock: 0 }, b: { diasConStock: 0 } });
    expect(l).toMatchObject({ regla: "datos_insuficientes", texto: "No hay historial suficiente para una lectura fiable", tono: "neutro" });
  });
});

describe("lecturaDesempeno: comportamiento comercial piso/almacén (2026-09-24)", () => {
  it("Problema de reposición: vende a buen ritmo, pero el piso se quebró a mitad de camino y luego se repuso", () => {
    const f = fila({ a: { ventas: 4, stockInicio: 10, stockCierre: 5 }, b: { ventas: 4, stockCierre: 8 } });
    f.pisoEventos = [
      { ts: "2026-09-01T00:00:00Z", delta: 10, esVenta: false, esMovimientoInterno: false },
      { ts: "2026-09-05T00:00:00Z", delta: -10, esVenta: true, esMovimientoInterno: false }, // toca 0
      { ts: "2026-09-20T00:00:00Z", delta: 8, esVenta: false, esMovimientoInterno: false }, // repone
    ];
    expect(lecturaDesempeno(analizarDesempeno(f, M30), M30.dias)?.regla).toBe("problema_reposicion");
  });

  it("Buen producto + sobrestock: rota bien en el piso, pero la rotación total cae muy por debajo (duerme en almacén)", () => {
    const f = fila({
      a: { ventas: 10, pisoPromedio: 2, totalPromedio: 20, stockInicio: 5, stockCierre: 5 },
      b: { ventas: 10, pisoPromedio: 2, totalPromedio: 20, stockCierre: 5 },
    });
    expect(lecturaDesempeno(analizarDesempeno(f, M30), M30.dias)?.regla).toBe("sobrestock");
  });
});

describe("lecturaComparacion: las mismas reglas, sobre B y frente a A", () => {
  it("1 · cifras estimadas antes que cualquier cambio", () => {
    expect(cmp({ ledger: false, a: { ventas: 5, stockInicio: 50, stockCierre: 45 }, b: { ventas: 15, stockInicio: 45, stockCierre: 30 } })?.regla).toBe("estimada");
  });

  it("2 · se agotó en B gana a «aceleró»", () => {
    expect(cmp({ a: { ventas: 2, stockInicio: 10, stockCierre: 8 }, b: { ventas: 8, stockInicio: 8, stockCierre: 0 } })).toMatchObject({ regla: "agotada", texto: "Se agotó en B: pendiente reponer" });
  });

  it("3 · sin ventas en B con stock parado", () => {
    expect(cmp({ a: { ventas: 6, stockInicio: 45, stockCierre: 39 }, b: { stockInicio: 39, stockCierre: 39 } })).toMatchObject({ regla: "sin_ventas", texto: "Sin ventas con 39 u. en stock: liquidar o trasladar" });
  });

  it("4 · el cambio más importante de A a B, con su número; un filtro activo manda sobre la prioridad", () => {
    const o = { a: { ventas: 5, stockInicio: 50, stockCierre: 45 }, b: { ventas: 15, stockInicio: 45, stockCierre: 30 } };
    expect(cmp(o)).toMatchObject({ regla: "acelero", tono: "verde", texto: "Aceleró +200% frente a A" });
    const x = analizarVarianteComparacion(fila(o), 30, 30);
    expect(x.mejoroRotacion).toBe(true);
    expect(lecturaComparacion(x, 30, "mejoro_rotacion")?.regla).toBe("mejoro_rotacion");
  });

  it("4 · un cambio de sell-through se dice en puntos, con su signo", () => {
    // Mismo ritmo y misma rotación; en B entró stock, así que vendió una parte menor de lo disponible.
    const l = cmp({ a: { ventas: 6, stockInicio: 20, stockCierre: 14 }, b: { ventas: 6, stockInicio: 20, entradas: 20, stockCierre: 14 } });
    expect(l).toMatchObject({ regla: "sell_through_baja", tono: "ambar", texto: "Sell-through bajó −15 pp" });
  });

  it("5 · vendió el 80 % o más en B, sin otro cambio", () => {
    const igual = { ventas: 8, stockInicio: 10, stockCierre: 2 };
    expect(cmp({ a: igual, b: igual })).toMatchObject({ regla: "vendio_casi_todo", texto: "Vendió el 80% de lo disponible" });
  });

  it("7 · sin cambio relevante cuando nada se movió", () => {
    const igual = { ventas: 4, stockInicio: 20, stockCierre: 16 };
    expect(cmp({ a: igual, b: igual })).toMatchObject({ regla: "sin_cambio", tono: "neutro" });
  });
});
