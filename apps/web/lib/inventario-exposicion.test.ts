import { describe, expect, it } from "vitest";
import { armarCohortes, esSobrestockTotal, ritmoMuestraLimitada, rotacionUnidades, sellThroughExposicion, tuvoQuiebreEnPiso, type EventoPiso } from "./inventario-exposicion";

// EXPOSICIÓN COMERCIAL (definición canónica de Felipe, 2026-09-24): el reloj CORRE en piso, SE PAUSA en
// almacén, y CONTINÚA —nunca se reinicia— cuando la cantidad vuelve al piso. `esMovimientoInterno` es la
// señal (desde `motivo = 'movimiento_interno'` en SQL) que distingue un regreso real desde almacén
// (reanuda) de stock genuinamente nuevo (reloj en cero) o de una pérdida permanente (nunca vuelve).
//
// SELL-THROUGH DE EXPOSICIÓN = cohortes FIFO por CANTIDAD (nunca por identidad física: no existe
// trazabilidad de lote en `mover_interno`) sobre los eventos de piso. Solo las cohortes MADURAS (exposición
// ACUMULADA de 7 días, con pausas, o vendidas del todo antes) entran al %.

const evento = (o: Partial<EventoPiso>): EventoPiso => ({ ts: "2026-09-01T00:00:00Z", delta: 0, esVenta: false, esMovimientoInterno: false, ...o });

describe("armarCohortes", () => {
  it("una entrada nueva (no es regreso) abre una cohorte con lo mismo que llegó, reloj corriendo desde ya", () => {
    const [c] = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 })]);
    expect(c).toEqual({ ts: "2026-09-01T00:00:00Z", cantidadInicial: 10, cantidadRestante: 10, segundosAcumulados: 0, abiertaDesde: "2026-09-01T00:00:00Z" });
  });

  it("una venta consume la cohorte más vieja y no toca su historia de exposición", () => {
    const [c] = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esVenta: true })]);
    expect(c).toMatchObject({ cantidadInicial: 10, cantidadRestante: 6, abiertaDesde: "2026-09-01T00:00:00Z" });
  });

  it("una pérdida permanente (ajuste, merma, traslado a OTRA sede — no es venta ni movimiento interno) resta también de cantidadInicial: nunca vuelve", () => {
    const [c] = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esVenta: false, esMovimientoInterno: false })]);
    expect(c).toMatchObject({ cantidadInicial: 6, cantidadRestante: 6 });
  });

  it("una salida a almacén (movimiento interno) PAUSA la cohorte: no resta cantidadInicial, solo congela el reloj", () => {
    const [c] = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-06T00:00:00Z", delta: -10, esVenta: false, esMovimientoInterno: true })]);
    expect(c).toEqual({ ts: "2026-09-01T00:00:00Z", cantidadInicial: 10, cantidadRestante: 10, segundosAcumulados: 5 * 86400, abiertaDesde: null });
  });

  it("una salida sin cohorte previa (ledger inconsistente) no inventa una cohorte negativa", () => {
    expect(armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: -5, esVenta: true })])).toEqual([]);
  });
});

describe("sellThroughExposicion — caso E: agotamiento (venta total antes de que madure la ventana)", () => {
  it("una cohorte vendida por completo madura de inmediato, sin esperar los 7 días — el % no se penaliza por poca antigüedad", () => {
    const eventos = [evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-02T00:00:00Z", delta: -10, esVenta: true })];
    const r = sellThroughExposicion(eventos, new Date("2026-09-03T00:00:00Z"));
    expect(r).toEqual({ pct: 100, vendidoMaduro: 10, disponibleMaduro: 10, pendienteMadurez: 0, estimado: false });
  });
});

describe("sellThroughExposicion — caso F: reposición el último día del período no diluye el sell-through", () => {
  it("una entrada reciente (todavía inmadura) queda aparte en pendienteMadurez y no entra al %", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: -6, esVenta: true }),
      evento({ ts: "2026-09-19T00:00:00Z", delta: 50 }), // llega el último día del período, sin tiempo de venderse
    ];
    const comoDe = new Date("2026-09-20T00:00:00Z");
    const r = sellThroughExposicion(eventos, comoDe, 7);
    // Sin el corte por madurez, el % sería 6/60 = 10% — la reposición ahogaría un producto que responde bien.
    expect(r).toEqual({ pct: 60, vendidoMaduro: 6, disponibleMaduro: 10, pendienteMadurez: 50, estimado: false });
  });
});

describe("sellThroughExposicion — caso J: exposición ACUMULADA con pausa, no calendario desde el último regreso", () => {
  it("5 días en piso + 3 en almacén + 4 en piso = 9 días acumulados (no 4): ya madura con ventana de 7", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-06T00:00:00Z", delta: -10, esVenta: false, esMovimientoInterno: true }), // pausa tras 5 días
      evento({ ts: "2026-09-09T00:00:00Z", delta: 10, esMovimientoInterno: true }), // regresa tras 3 días en almacén
    ];
    // Solo 4 días de calendario desde el regreso — con un reloj que reinicia, esto seguiría inmaduro
    // (pct: null). Con el reloj acumulado ya es evaluable: 0% es un dato real (nada vendido de lo maduro),
    // no lo mismo que «sin base».
    const r = sellThroughExposicion(eventos, new Date("2026-09-13T00:00:00Z"), 7);
    expect(r).toEqual({ pct: 0, vendidoMaduro: 0, disponibleMaduro: 10, pendienteMadurez: 0, estimado: true });
  });
});

describe("sellThroughExposicion — caso K: la exposición acumulada alcanza la madurez exacta", () => {
  it("5 días piso + 3 almacén + 2 piso = 7 acumulados: ya es evaluable, aunque solo 2 días desde el regreso", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-06T00:00:00Z", delta: -10, esVenta: false, esMovimientoInterno: true }),
      evento({ ts: "2026-09-09T00:00:00Z", delta: 10, esMovimientoInterno: true }),
    ];
    const r = sellThroughExposicion(eventos, new Date("2026-09-11T00:00:00Z"), 7);
    expect(r.disponibleMaduro).toBe(10);
  });
});

describe("sellThroughExposicion — caso Q: piso → almacén → piso no cuenta la misma cantidad dos veces", () => {
  it("las 4 unidades que fueron y volvieron se contabilizan UNA vez, no dos", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esVenta: false, esMovimientoInterno: true }), // pausa parcial
      evento({ ts: "2026-09-03T00:00:00Z", delta: 4, esMovimientoInterno: true }), // regresa
    ];
    const comoDe = new Date("2026-09-25T00:00:00Z"); // ambas porciones ya maduraron por antigüedad
    const r = sellThroughExposicion(eventos, comoDe, 7);
    // Entraron 14 unidades en bruto (10 + 4), pero el inventario real siempre fue 10.
    expect(r.disponibleMaduro).toBe(10);
    expect(r.vendidoMaduro).toBe(0);
    expect(r.pendienteMadurez).toBe(0);
    expect(r.estimado).toBe(true);
  });

  it("si esa cantidad vuelta a poner en piso SÍ se vende después, cuenta como una venta real", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esVenta: false, esMovimientoInterno: true }),
      evento({ ts: "2026-09-03T00:00:00Z", delta: 4, esMovimientoInterno: true }),
      evento({ ts: "2026-09-10T00:00:00Z", delta: -4, esVenta: true }),
    ];
    const r = sellThroughExposicion(eventos, new Date("2026-09-25T00:00:00Z"), 7);
    expect(r).toEqual({ pct: 40, vendidoMaduro: 4, disponibleMaduro: 10, pendienteMadurez: 0, estimado: true });
  });

  it("un regreso sin pausa previa que lo explique (más cantidad de la que había pausada) abre cohorte nueva para el sobrante, en vez de fingir un regreso que los datos no sostienen", () => {
    const eventos = [evento({ ts: "2026-09-01T00:00:00Z", delta: 5, esMovimientoInterno: true })];
    const r = sellThroughExposicion(eventos, new Date("2026-09-10T00:00:00Z"), 7);
    expect(r).toMatchObject({ disponibleMaduro: 5, vendidoMaduro: 0 });
  });
});

// decisión 4 (2026-09-24): dos relojes distintos, según qué produjo el regreso a piso.
// Caso A (movimiento interno piso↔almacén: PAUSA y CONTINÚA) ya está probado arriba — Q, J, K.
describe("decisión 4 (2026-09-24) — devolución real de cliente: reloj nuevo, no una pausa", () => {
  it("Caso B — una devolución vendible entra DIRECTO a piso (aprobar_devolucion: motivo='devolucion', nunca 'movimiento_interno'): abre una cohorte NUEVA, no hereda la exposición de la venta anterior", () => {
    const eventos = [
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), // cohorte original
      evento({ ts: "2026-09-02T00:00:00Z", delta: -10, esVenta: true }), // se vendió toda: madura de inmediato (caso E)
      evento({ ts: "2026-09-20T00:00:00Z", delta: 1, esMovimientoInterno: false }), // la clienta la devuelve: vuelve a piso DIRECTO (nunca pasa por almacén)
    ];
    const r = sellThroughExposicion(eventos, new Date("2026-09-22T00:00:00Z"), 7); // solo 2 días desde la devolución
    // La unidad devuelta es una cohorte aparte, inmadura (2 días < 7): no hereda los 21 días de exposición
    // de la cohorte original. `estimado: false` — a diferencia de un movimiento interno, esto NO pasó por
    // la aproximación por cantidad: no hubo ningún ciclo piso↔almacén que reconstruir.
    expect(r).toEqual({ pct: 100, vendidoMaduro: 10, disponibleMaduro: 10, pendienteMadurez: 1, estimado: false });
  });
});

describe("sellThroughExposicion — sin eventos, no hay base para calcular: N/D, nunca 0%", () => {
  it("devuelve pct null cuando no hay ninguna cohorte (nunca aproxima con un 0)", () => {
    expect(sellThroughExposicion([], new Date("2026-09-25T00:00:00Z"))).toEqual({ pct: null, vendidoMaduro: 0, disponibleMaduro: 0, pendienteMadurez: 0, estimado: false });
  });

  it("con una sola cohorte inmadura y nada más, tampoco hay base todavía", () => {
    const r = sellThroughExposicion([evento({ ts: "2026-09-20T00:00:00Z", delta: 10 })], new Date("2026-09-22T00:00:00Z"), 7);
    expect(r).toEqual({ pct: null, vendidoMaduro: 0, disponibleMaduro: 0, pendienteMadurez: 10, estimado: false });
  });
});

describe("rotacionUnidades — sección 14: unidades vendidas ÷ unidades promedio, nunca moneda/unidades", () => {
  it("es una razón pura en unidades", () => {
    expect(rotacionUnidades(10, 5)).toEqual({ calculable: true, veces: 2, motivo: null, unidadesVendidas: 10, unidadesPromedio: 5 });
  });

  it("sin promedio positivo, N/D — nunca un 0 disfrazado", () => {
    expect(rotacionUnidades(10, null)).toMatchObject({ calculable: false, motivo: "sin_inventario" });
    expect(rotacionUnidades(10, 0)).toMatchObject({ calculable: false, motivo: "sin_inventario" });
  });

  it("no vendió nada pero SÍ tuvo inventario: rotó 0 veces, eso no es N/D", () => {
    expect(rotacionUnidades(0, 5)).toEqual({ calculable: true, veces: 0, motivo: null, unidadesVendidas: 0, unidadesPromedio: 5 });
  });
});

describe("ritmoMuestraLimitada", () => {
  it("marca muestra limitada cuando los días con stock en piso son menos de la mitad del período", () => {
    expect(ritmoMuestraLimitada(3, 7)).toBe(true); // 3 < 3.5
    expect(ritmoMuestraLimitada(4, 7)).toBe(false); // 4 >= 3.5
  });

  it("sin días con stock calculables, o sin período, no hay muestra: limitada por definición", () => {
    expect(ritmoMuestraLimitada(null, 7)).toBe(true);
    expect(ritmoMuestraLimitada(5, 0)).toBe(true);
  });
});

describe("tuvoQuiebreEnPiso — «problema de reposición»: se quedó sin piso a mitad de camino y luego repuso", () => {
  it("detecta un quiebre con recuperación posterior", () => {
    const eventos = [evento({ ts: "2026-09-01T00:00:00Z", delta: 5 }), evento({ ts: "2026-09-05T00:00:00Z", delta: -5, esVenta: true }), evento({ ts: "2026-09-10T00:00:00Z", delta: 8 })];
    expect(tuvoQuiebreEnPiso(eventos)).toBe(true);
  });

  it("un cierre agotado sin reponer todavía NO es «quiebre con recuperación»: eso lo dice la regla de «Se agotó»", () => {
    const eventos = [evento({ ts: "2026-09-01T00:00:00Z", delta: 5 }), evento({ ts: "2026-09-05T00:00:00Z", delta: -5, esVenta: true })];
    expect(tuvoQuiebreEnPiso(eventos)).toBe(false);
  });

  it("sin tocar nunca cero, no hay quiebre que reportar", () => {
    const eventos = [evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-05T00:00:00Z", delta: -4, esVenta: true }), evento({ ts: "2026-09-10T00:00:00Z", delta: 6 })];
    expect(tuvoQuiebreEnPiso(eventos)).toBe(false);
  });
});

describe("esSobrestockTotal", () => {
  it("marca sobrestock cuando la rotación total cae bajo la mitad de la rotación en piso", () => {
    expect(esSobrestockTotal(10, 4)).toBe(true); // 4 < 5
    expect(esSobrestockTotal(10, 6)).toBe(false); // 6 >= 5
  });

  it("sin las dos rotaciones calculables, nunca afirma sobrestock", () => {
    expect(esSobrestockTotal(null, 4)).toBe(false);
    expect(esSobrestockTotal(10, null)).toBe(false);
    expect(esSobrestockTotal(0, 4)).toBe(false);
  });
});
