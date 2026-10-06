import { describe, expect, it } from "vitest";
import { compararInstantes, historiaDeCohortes, type EventoPiso } from "./inventario-exposicion";

// EXPOSICIÓN COMERCIAL (definición canónica de Felipe, 2026-09-24): el reloj CORRE en piso, SE PAUSA en
// almacén, y CONTINÚA —nunca se reinicia— cuando la cantidad vuelve al piso. `esMovimientoInterno` es la
// señal (en SQL, `fn_es_traslado_interno`: traslado con la misma sede de origen y destino, ADR-0203) que
// distingue un regreso real desde almacén (reanuda) de stock genuinamente nuevo (reloj en cero) o de una
// pérdida permanente (nunca vuelve).
//
// LAS COHORTES (`historiaDeCohortes`) = FIFO por CANTIDAD (nunca por identidad física: no existe trazabilidad de
// lote en `mover_interno`) sobre los eventos de piso.

const evento = (o: Partial<EventoPiso>): EventoPiso => ({ ts: "2026-09-01T00:00:00Z", delta: 0, esVenta: false, esMovimientoInterno: false, ...o });

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

// PROPIEDAD (ADR-0248): en `historiaDeCohortes` las unidades se conservan. Sobre las historias de siempre de este archivo y
// sobre historias al azar (semilla fija: si falla, falla igual en todas partes).
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

describe("propiedad — en historiaDeCohortes las unidades se conservan (ADR-0248)", () => {
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
