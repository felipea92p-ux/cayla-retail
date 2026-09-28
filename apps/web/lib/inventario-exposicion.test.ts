import { describe, expect, it } from "vitest";
import { armarCohortes, compararInstantes, esSobrestockTotal, historiaDeCohortes, ritmoMuestraLimitada, rotacionUnidades, sellThroughExposicion, tuvoQuiebreEnPiso, type EventoPiso } from "./inventario-exposicion";

// EXPOSICIÓN COMERCIAL (definición canónica de Felipe, 2026-09-24): el reloj CORRE en piso, SE PAUSA en
// almacén, y CONTINÚA —nunca se reinicia— cuando la cantidad vuelve al piso. `esMovimientoInterno` es la
// señal (en SQL, `fn_es_traslado_interno`: traslado con la misma sede de origen y destino, ADR-0203) que
// distingue un regreso real desde almacén (reanuda) de stock genuinamente nuevo (reloj en cero) o de una
// pérdida permanente (nunca vuelve).
//
// SELL-THROUGH DE EXPOSICIÓN = cohortes FIFO por CANTIDAD (nunca por identidad física: no existe
// trazabilidad de lote en `mover_interno`) sobre los eventos de piso. Solo las cohortes MADURAS (exposición
// ACUMULADA de 7 días, con pausas, o vendidas del todo antes) entran al %.

const evento = (o: Partial<EventoPiso>): EventoPiso => ({ ts: "2026-09-01T00:00:00Z", delta: 0, esVenta: false, esMovimientoInterno: false, ...o });

describe("armarCohortes", () => {
  it("una entrada nueva (no es regreso) abre una cohorte con lo mismo que llegó, reloj corriendo desde ya", () => {
    const [c] = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 })]);
    expect(c).toEqual({ ts: "2026-09-01T00:00:00Z", cantidadInicial: 10, cantidadRestante: 10, segundosAcumulados: 0, abiertaDesde: "2026-09-01T00:00:00Z", edadDesconocida: false });
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
    expect(c).toEqual({ ts: "2026-09-01T00:00:00Z", cantidadInicial: 10, cantidadRestante: 10, segundosAcumulados: 5 * 86400, abiertaDesde: null, edadDesconocida: false });
  });

  it("una salida sin cohorte previa (ledger inconsistente) no inventa una cohorte negativa", () => {
    expect(armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: -5, esVenta: true })])).toEqual([]);
  });
});

// FIFO POR ANTIGÜEDAD (ADR-0248): el orden de consumo lo da la fecha de la cohorte (`ts`), no el lugar en que quedó en el
// arreglo. Antes, el pedazo de una cohorte partida se agregaba AL FINAL y una venta se llevaba una cohorte más nueva.
describe("armarCohortes — FIFO por antigüedad cuando una cohorte se parte (ADR-0248)", () => {
  it("una cohorte pausada del día 1 que vuelve en parte se vende antes que la del día 5 que ya estaba colgada", () => {
    const cohortes = armarCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), // A: llega el 1
      evento({ ts: "2026-09-02T00:00:00Z", delta: -10, esMovimientoInterno: true }), // A entera al almacén
      evento({ ts: "2026-09-05T00:00:00Z", delta: 5 }), // B: llega el 5 y se cuelga
      evento({ ts: "2026-09-06T00:00:00Z", delta: 4, esMovimientoInterno: true }), // vuelven 4 de A
      evento({ ts: "2026-09-07T00:00:00Z", delta: -3, esVenta: true }), // la venta sale de A, la más vieja
    ]);
    const del1Colgada = cohortes.filter((c) => c.ts === "2026-09-01T00:00:00Z" && c.abiertaDesde !== null);
    const del5 = cohortes.filter((c) => c.ts === "2026-09-05T00:00:00Z");
    expect(del1Colgada).toHaveLength(1);
    expect(del1Colgada[0]).toMatchObject({ cantidadInicial: 4, cantidadRestante: 1 });
    expect(del5).toEqual([expect.objectContaining({ cantidadInicial: 5, cantidadRestante: 5 })]);
  });

  it("al reanudar, vuelve primero el pedazo pausado más viejo aunque se haya partido después", () => {
    const cohortes = armarCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), // A
      evento({ ts: "2026-09-03T00:00:00Z", delta: 5 }), // C
      evento({ ts: "2026-09-04T00:00:00Z", delta: -12, esMovimientoInterno: true }), // A entera y 2 de C al almacén
      evento({ ts: "2026-09-05T00:00:00Z", delta: 10, esMovimientoInterno: true }), // vuelve A
      evento({ ts: "2026-09-06T00:00:00Z", delta: -1, esMovimientoInterno: true }), // 1 de A al almacén: A se parte
      evento({ ts: "2026-09-07T00:00:00Z", delta: 1, esMovimientoInterno: true }), // vuelve 1: el de A, no el de C
    ]);
    const pausadas = cohortes.filter((c) => c.abiertaDesde === null && c.cantidadRestante > 0);
    expect(pausadas).toEqual([expect.objectContaining({ ts: "2026-09-03T00:00:00Z", cantidadRestante: 2 })]);
  });

  it("el arreglo que devuelve queda ordenado por fecha de la cohorte", () => {
    const cohortes = armarCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esMovimientoInterno: true }),
      evento({ ts: "2026-09-03T00:00:00Z", delta: 6 }),
      evento({ ts: "2026-09-04T00:00:00Z", delta: 2, esMovimientoInterno: true }),
    ]);
    const fechas = cohortes.map((c) => c.ts);
    expect(fechas).toEqual([...fechas].sort());
  });

  it("dos eventos del mismo segundo se ordenan por el reloj, no por el texto: «10:00:00+00:00» va antes que «10:00:00.5+00:00»", () => {
    // Postgres escribe la hora sin fracción cuando cae justo en el segundo. Comparado como texto con `localeCompare`,
    // el «+» queda después del «.», y la venta pasaba a ir ANTES de la entrada que la explica.
    const [c] = armarCohortes([
      evento({ ts: "2026-09-01T10:00:00+00:00", delta: 5 }),
      evento({ ts: "2026-09-01T10:00:00.5+00:00", delta: -2, esVenta: true }),
    ]);
    expect(c).toMatchObject({ cantidadInicial: 5, cantidadRestante: 3 });
  });
});

// HISTORIA DE COHORTES (ADR-0248): las mismas cohortes, más cada venta y pérdida con lo que llevaba colgada al salir.
// Es lo que necesita la curva de «cuánto tarda en venderse» de Frescura, sin un segundo FIFO.
const DIA = 86_400;

describe("historiaDeCohortes — salidas con su exposición", () => {
  it("una venta anota cuánto llevaba colgada la cohorte al venderse", () => {
    const { salidas } = historiaDeCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }), evento({ ts: "2026-09-04T00:00:00Z", delta: -3, esVenta: true })]);
    expect(salidas).toEqual([{ tipo: "venta", cantidad: 3, segundosExpuesta: 3 * DIA, edadDesconocida: false, ts: "2026-09-04T00:00:00Z" }]);
  });

  it("una venta que toma de dos cohortes da dos salidas, cada una con su propia exposición", () => {
    const { salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 2 }),
      evento({ ts: "2026-09-03T00:00:00Z", delta: 5 }),
      evento({ ts: "2026-09-05T00:00:00Z", delta: -4, esVenta: true }),
    ]);
    expect(salidas).toEqual([
      { tipo: "venta", cantidad: 2, segundosExpuesta: 4 * DIA, edadDesconocida: false, ts: "2026-09-05T00:00:00Z" },
      { tipo: "venta", cantidad: 2, segundosExpuesta: 2 * DIA, edadDesconocida: false, ts: "2026-09-05T00:00:00Z" },
    ]);
  });

  it("el tiempo en el almacén no cuenta: 5 días colgada + 3 guardada + 2 colgada = 7 días al venderse", () => {
    const { salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-06T00:00:00Z", delta: -10, esMovimientoInterno: true }),
      evento({ ts: "2026-09-09T00:00:00Z", delta: 10, esMovimientoInterno: true }),
      evento({ ts: "2026-09-11T00:00:00Z", delta: -2, esVenta: true }),
    ]);
    expect(salidas).toEqual([{ tipo: "venta", cantidad: 2, segundosExpuesta: 7 * DIA, edadDesconocida: false, ts: "2026-09-11T00:00:00Z" }]);
  });

  it("una pérdida permanente se anota como «perdida»; guardar en el almacén no es una salida", () => {
    const { salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10 }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: -3, esMovimientoInterno: true }), // al almacén: pausa
      evento({ ts: "2026-09-03T00:00:00Z", delta: -4 }), // merma o traslado a otra sede
    ]);
    expect(salidas).toEqual([{ tipo: "perdida", cantidad: 4, segundosExpuesta: 2 * DIA, edadDesconocida: false, ts: "2026-09-03T00:00:00Z" }]);
  });

  it("una venta sin ninguna cohorte que la explique (el libro no cuadra) no se anota: no hay edad que medirle", () => {
    expect(historiaDeCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: -5, esVenta: true })])).toEqual({ cohortes: [], salidas: [] });
  });
});

// Revisión 9 del paso 3 de Frescura (ADR-0208, 2026-09-28): tres cosas que el FIFO ya hacía bien y que ninguna prueba
// vigilaba (un cambio a propósito en cada una pasaba las 206 pruebas de la web). Lo lee Frescura (la vara y la rapidez) y
// también Análisis.
describe("historiaDeCohortes — lo que ya hacía y nada vigilaba (revisión 9 de Frescura)", () => {
  it("la parte que vuelve del almacén conserva sus días colgada: 10 días colgadas, 10 guardadas, vuelve 1 de 3 y se vende al día siguiente → 11 días, no 1", () => {
    const { cohortes, salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 3 }),
      evento({ ts: "2026-09-11T00:00:00Z", delta: -3, esMovimientoInterno: true }),
      evento({ ts: "2026-09-21T00:00:00Z", delta: 1, esMovimientoInterno: true }),
      evento({ ts: "2026-09-22T00:00:00Z", delta: -1, esVenta: true }),
    ]);
    expect(salidas).toEqual([{ tipo: "venta", cantidad: 1, segundosExpuesta: 11 * DIA, edadDesconocida: false, ts: "2026-09-22T00:00:00Z" }]);
    // Las 2 que siguen guardadas conservan sus 10 días.
    expect(cohortes.filter((c) => c.cantidadRestante > 0)).toEqual([expect.objectContaining({ cantidadRestante: 2, segundosAcumulados: 10 * DIA, abiertaDesde: null })]);
  });

  it("dos pausas seguidas suman: 10 días colgada, guardada, 10 más, guardada otra vez y 5 más → 25 días al venderse (la segunda no pisa la primera)", () => {
    const { salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 1 }),
      evento({ ts: "2026-09-11T00:00:00Z", delta: -1, esMovimientoInterno: true }),
      evento({ ts: "2026-09-21T00:00:00Z", delta: 1, esMovimientoInterno: true }),
      evento({ ts: "2026-10-01T00:00:00Z", delta: -1, esMovimientoInterno: true }),
      evento({ ts: "2026-10-11T00:00:00Z", delta: 1, esMovimientoInterno: true }),
      evento({ ts: "2026-10-16T00:00:00Z", delta: -1, esVenta: true }),
    ]);
    expect(salidas).toEqual([{ tipo: "venta", cantidad: 1, segundosExpuesta: 25 * DIA, edadDesconocida: false, ts: "2026-10-16T00:00:00Z" }]);
  });

  it("una pérdida (traslado a otra sede, merma) de lo que no tiene edad conserva la marca: la carga inicial que se va a otra tienda no entra a la curva como si se supiera su edad", () => {
    const { salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 3, edadDesconocida: true }),
      evento({ ts: "2026-09-05T00:00:00Z", delta: -2 }),
    ]);
    expect(salidas).toEqual([{ tipo: "perdida", cantidad: 2, segundosExpuesta: 4 * DIA, edadDesconocida: true, ts: "2026-09-05T00:00:00Z" }]);
  });
});

describe("historiaDeCohortes — la edad desconocida viaja con la unidad (ADR-0248)", () => {
  it("se hereda al partir, al pausar y al reanudar, y pasa a la venta", () => {
    const { cohortes, salidas } = historiaDeCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 10, edadDesconocida: true }), // carga inicial: ya estaba colgada
      evento({ ts: "2026-09-02T00:00:00Z", delta: -4, esMovimientoInterno: true }), // se parte al guardar 4
      evento({ ts: "2026-09-03T00:00:00Z", delta: 2, esMovimientoInterno: true }), // se parte al volver 2
      evento({ ts: "2026-09-04T00:00:00Z", delta: -9, esVenta: true }),
    ]);
    expect(cohortes).toHaveLength(3);
    expect(cohortes.every((c) => c.edadDesconocida)).toBe(true);
    expect(salidas.length).toBeGreaterThan(0);
    expect(salidas.every((s) => s.edadDesconocida)).toBe(true);
  });

  it("una entrada sin la marca, en la misma talla, nace con edad conocida", () => {
    const cohortes = armarCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 5, edadDesconocida: true }), evento({ ts: "2026-09-05T00:00:00Z", delta: 3 })]);
    expect(cohortes.map((c) => c.edadDesconocida)).toEqual([true, false]);
  });

  it("una bajada sin nada pausado que la explique abre cohorte nueva: con la marca si el evento la trae (carga inicial), sin ella si no (mercadería que nunca estuvo colgada)", () => {
    const cohortes = armarCohortes([
      evento({ ts: "2026-09-01T00:00:00Z", delta: 3, esMovimientoInterno: true, edadDesconocida: true }),
      evento({ ts: "2026-09-02T00:00:00Z", delta: 3, esMovimientoInterno: true }),
    ]);
    expect(cohortes.map((c) => [c.cantidadInicial, c.edadDesconocida])).toEqual([
      [3, true],
      [3, false],
    ]);
  });

  it("la marca en una salida no hace nada: la edad la trae la unidad, no el evento que se la lleva", () => {
    const { salidas } = historiaDeCohortes([evento({ ts: "2026-09-01T00:00:00Z", delta: 5 }), evento({ ts: "2026-09-02T00:00:00Z", delta: -1, esVenta: true, edadDesconocida: true })]);
    expect(salidas[0].edadDesconocida).toBe(false);
  });

  it("el `oid` del evento no cambia nada del FIFO", () => {
    const sin = [evento({ ts: "2026-09-01T00:00:00Z", delta: 5 }), evento({ ts: "2026-09-02T00:00:00Z", delta: -2, esVenta: true })];
    const con = sin.map((e, i) => ({ ...e, oid: `mov-${i}` }));
    expect(historiaDeCohortes(con)).toEqual(historiaDeCohortes(sin));
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

// PROPIEDAD (ADR-0248): `armarCohortes` y `historiaDeCohortes` son el MISMO FIFO, y las unidades se conservan. Sobre las
// historias de siempre de este archivo y sobre historias al azar (semilla fija: si falla, falla igual en todas partes).
const H = (ts: string, delta: number, o: Partial<EventoPiso> = {}): EventoPiso => evento({ ts: `2026-09-${ts}T00:00:00Z`, delta, ...o });
const CASOS_DE_SIEMPRE: EventoPiso[][] = [
  [H("01", 10)],
  [H("01", 10), H("02", -4, { esVenta: true })],
  [H("01", 10), H("02", -4)],
  [H("01", 10), H("06", -10, { esMovimientoInterno: true })],
  [H("01", -5, { esVenta: true })],
  [H("01", 10), H("02", -10, { esVenta: true })],
  [H("01", 10), H("02", -6, { esVenta: true }), H("19", 50)],
  [H("01", 10), H("06", -10, { esMovimientoInterno: true }), H("09", 10, { esMovimientoInterno: true })],
  [H("01", 10), H("02", -4, { esMovimientoInterno: true }), H("03", 4, { esMovimientoInterno: true })],
  [H("01", 10), H("02", -4, { esMovimientoInterno: true }), H("03", 4, { esMovimientoInterno: true }), H("10", -4, { esVenta: true })],
  [H("01", 5, { esMovimientoInterno: true })],
  [H("01", 10), H("02", -10, { esVenta: true }), H("20", 1)],
  [H("01", 10), H("02", -10, { esMovimientoInterno: true }), H("05", 5), H("06", 4, { esMovimientoInterno: true }), H("07", -3, { esVenta: true })],
  [H("01", 10), H("03", 5), H("04", -12, { esMovimientoInterno: true }), H("05", 10, { esMovimientoInterno: true }), H("06", -1, { esMovimientoInterno: true }), H("07", 1, { esMovimientoInterno: true })],
];

/** Generador con semilla (mulberry32): mismas historias en cada corrida. */
function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type HistoriaAlAzar = { eventos: EventoPiso[]; piso: number; guardado: number; vendidas: number; perdidas: number; conMarca: boolean };

/** Una talla en una sede, con un libro que cuadra (el piso nunca baja de 0): llegadas, bajadas, ventas, retiros al
 *  almacén y pérdidas. `guardado` sigue la regla por cantidad del FIFO: una bajada devuelve primero lo que se había
 *  retirado del piso, y solo lo que pasa de eso es mercadería que nunca estuvo colgada. */
function historiaAlAzar(r: () => number): HistoriaAlAzar {
  const entero = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  let t = Date.parse("2026-06-01T00:00:00Z");
  let piso = 0, guardado = 0, vendidas = 0, perdidas = 0, conMarca = false;
  const eventos: EventoPiso[] = [];
  for (let k = entero(1, 40); k > 0; k--) {
    t += r() < 0.1 ? 0 : entero(1, 72) * 3_600_000; // a veces, dos eventos en el mismo instante
    const ts = new Date(t).toISOString();
    const accion = r();
    if (accion < 0.2 || piso === 0) {
      const q = entero(1, 6);
      const marca = r() < 0.25;
      conMarca ||= marca;
      if (r() < 0.5) {
        eventos.push({ ts, delta: q, esVenta: false, esMovimientoInterno: true, edadDesconocida: marca });
        guardado -= Math.min(guardado, q);
        piso += q;
      } else {
        eventos.push({ ts, delta: q, esVenta: false, esMovimientoInterno: false, edadDesconocida: marca });
        piso += q;
      }
    } else if (accion < 0.6) {
      const q = entero(1, piso);
      eventos.push({ ts, delta: -q, esVenta: true, esMovimientoInterno: false });
      piso -= q;
      vendidas += q;
    } else if (accion < 0.85) {
      const q = entero(1, piso);
      eventos.push({ ts, delta: -q, esVenta: false, esMovimientoInterno: true });
      piso -= q;
      guardado += q;
    } else {
      const q = entero(1, piso);
      eventos.push({ ts, delta: -q, esVenta: false, esMovimientoInterno: false });
      piso -= q;
      perdidas += q;
    }
  }
  return { eventos, piso, guardado, vendidas, perdidas, conMarca };
}

const suma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function comprobarLoComun(eventos: readonly EventoPiso[]): ReturnType<typeof historiaDeCohortes> {
  const h = historiaDeCohortes(eventos);
  expect(armarCohortes(eventos)).toEqual(h.cohortes);
  const vendidoEnCohortes = suma(h.cohortes.map((c) => c.cantidadInicial - c.cantidadRestante));
  expect(suma(h.salidas.filter((s) => s.tipo === "venta").map((s) => s.cantidad))).toBeCloseTo(vendidoEnCohortes, 6);
  for (let i = 1; i < h.cohortes.length; i++) expect(compararInstantes(h.cohortes[i - 1].ts, h.cohortes[i].ts)).toBeLessThanOrEqual(0);
  for (const c of h.cohortes) {
    expect(c.cantidadRestante).toBeGreaterThanOrEqual(0);
    expect(c.cantidadRestante).toBeLessThanOrEqual(c.cantidadInicial + 1e-9);
  }
  for (const s of h.salidas) {
    expect(s.cantidad).toBeGreaterThan(0);
    expect(s.segundosExpuesta).toBeGreaterThanOrEqual(0);
  }
  return h;
}

describe("propiedad — armarCohortes ≡ historiaDeCohortes(e).cohortes, y las unidades se conservan (ADR-0248)", () => {
  it.each(CASOS_DE_SIEMPRE.map((e, i) => [i, e] as const))("historia de siempre n.º %i", (_, eventos) => {
    comprobarLoComun(eventos);
  });

  it("300 historias al azar con un libro que cuadra: lo colgado es el piso, lo pausado es lo guardado, y cada venta y pérdida quedó anotada", () => {
    const r = azar(20260927);
    for (let n = 0; n < 300; n++) {
      const x = historiaAlAzar(r);
      const h = comprobarLoComun(x.eventos);
      const colgado = suma(h.cohortes.filter((c) => c.abiertaDesde !== null).map((c) => c.cantidadRestante));
      const pausado = suma(h.cohortes.filter((c) => c.abiertaDesde === null).map((c) => c.cantidadRestante));
      expect(colgado).toBe(x.piso);
      expect(pausado).toBe(x.guardado);
      expect(suma(h.salidas.filter((s) => s.tipo === "venta").map((s) => s.cantidad))).toBe(x.vendidas);
      expect(suma(h.salidas.filter((s) => s.tipo === "perdida").map((s) => s.cantidad))).toBe(x.perdidas);
      if (!x.conMarca) expect([...h.cohortes, ...h.salidas].some((c) => c.edadDesconocida)).toBe(false);
    }
  });
});
