import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import {
  analizarSede,
  construirVara,
  cortes,
  curvaSin,
  elegirVentana,
  estadoFrescura,
  estaQuieta,
  excluirTardias,
  kaplanMeier,
  leerConfianzaRegistro,
  leerFrescuraSede,
  nivelPorVentas,
  rapidez,
  recortarEventos,
  referenciaCayla,
  relojNovedad,
  varaPorVentanas,
  sugerenciasDe,
  tramoDe,
  unidadesParaVara,
  type EntradaEstado,
  type LecturaFrescuraConPiso,
  type NivelConfianza,
  type Observacion,
  type ObservacionesSede,
  type Rapidez,
  type Sugerencia,
  type TallaFrescuraCruda,
  type Tramo,
  type Vara,
} from "./frescura-reglas";

// Frescura del piso (ADR-0208 paso 3c, ADR-0248): la vara de categoría × sede (Kaplan-Meier), el reloj de novedad de
// la prenda, la rapidez contra su categoría y el estado cerrado de cada prenda.

const D = 86_400; // segundos por día
const BASE = Date.UTC(2026, 5, 1); // 1 de junio de 2026, 00:00 UTC
/** El instante `dia` días (y `minuto` minutos) después de la base, como lo escribe la base. */
const ts = (dia: number, minuto = 0) => new Date(BASE + dia * D * 1000 + minuto * 60_000).toISOString();
const ev = (dia: number, delta: number, o: Partial<EventoPiso> = {}, minuto = 0): EventoPiso => ({ ts: ts(dia, minuto), delta, esVenta: false, esMovimientoInterno: false, ...o });
const bajada = (dia: number, n: number, o: Partial<EventoPiso> = {}, minuto = 0) => ev(dia, n, { esMovimientoInterno: true, ...o }, minuto);
const venta = (dia: number, n: number, minuto = 0) => ev(dia, -n, { esVenta: true }, minuto);
const vendida = (dias: number, peso = 1): Observacion => ({ segundos: dias * D, vendida: true, peso });
const colgada = (dias: number, peso = 1): Observacion => ({ segundos: dias * D, vendida: false, peso });
/** Solo las unidades con edad conocida (lo que entra a la curva). */
const observacionesDe = (eventos: readonly EventoPiso[], ahora: string) => unidadesParaVara(eventos, ahora).observaciones;

describe("kaplanMeier y cortes", () => {
  // Ejemplo calculado a mano: 8 unidades. Vendidas a los 2, 3, 3, 5 y 8 días; siguen colgadas (censuradas) a los 4, 6 y 9.
  //   día 2: en riesgo 8, vende 1 → S = 7/8 = 0,875         H = 1/8
  //   día 3: en riesgo 7, vende 2 → S = 0,875 · 5/7 = 0,625  H = 1/8 + 2/7
  //   día 4: sale 1 sin vender (no mueve la curva)
  //   día 5: en riesgo 4, vende 1 → S = 0,625 · 3/4 = 0,46875  H += 1/4   → P50 = día 5
  //   día 6: sale 1 sin vender
  //   día 8: en riesgo 2, vende 1 → S = 0,46875 · 1/2 = 0,234375  H += 1/2 → P75 = día 8
  //   día 9: sale 1 sin vender. La curva termina en 0,234: no llega a 0,1 → P90 nulo.
  const ejemplo = [vendida(2), vendida(3), vendida(3), colgada(4), vendida(5), colgada(6), vendida(8), colgada(9)];

  it("coincide con el ejemplo calculado a mano, con las unidades que siguen colgadas", () => {
    const c = kaplanMeier(ejemplo);
    expect(c.tiempos).toEqual([2 * D, 3 * D, 5 * D, 8 * D]);
    expect(c.supervivencia.map((s) => Number(s.toFixed(6)))).toEqual([0.875, 0.625, 0.46875, 0.234375]);
    const h = [1 / 8, 1 / 8 + 2 / 7, 1 / 8 + 2 / 7 + 1 / 4, 1 / 8 + 2 / 7 + 1 / 4 + 1 / 2];
    c.riesgoAcumulado.forEach((x, i) => expect(x).toBeCloseTo(h[i], 12));
    expect(c).toMatchObject({ tMax: 9 * D, vendidas: 5, unidades: 8 });
    expect(cortes(c)).toEqual({ p50: 5 * D, p75: 8 * D, p90: null });
  });

  it("lo que sigue colgado alarga la referencia: el promedio de lo vendido (4,2 días) la acortaba", () => {
    const soloVendidas = ejemplo.filter((o) => o.vendida);
    const promedio = soloVendidas.reduce((s, o) => s + o.segundos, 0) / soloVendidas.length / D;
    expect(promedio).toBeCloseTo(4.2, 9);
    expect(cortes(kaplanMeier(ejemplo)).p50).toBe(5 * D);
  });

  it("dos unidades con peso 1 en el mismo instante dan lo mismo que una con peso 2", () => {
    const juntas = [vendida(2), vendida(3, 2), colgada(4), vendida(5), colgada(6), vendida(8), colgada(9)];
    expect(kaplanMeier(juntas)).toEqual(kaplanMeier(ejemplo));
  });

  it("una unidad sin vender en el mismo instante que una venta cuenta en riesgo ese instante", () => {
    expect(kaplanMeier([vendida(2), colgada(2)]).supervivencia).toEqual([0.5]);
  });

  it("el corte exacto: vendida JUSTO la mitad (S = 0,5) ya es el P50; 3 de 4 (S = 0,25), el P75 (revisión 4)", () => {
    // Con unidades enteras es lo común (10 de 20, 1 de 2): si el corte pidiera S < 0,5, el P50 saldría nulo y toda la
    // categoría quedaría «aún sin referencia».
    expect(cortes(kaplanMeier([vendida(2), colgada(3)])).p50).toBe(2 * D);
    expect(cortes(kaplanMeier([vendida(1), vendida(2), vendida(3), colgada(9)])).p75).toBe(3 * D);
    expect(cortes(kaplanMeier([...Array.from({ length: 9 }, (_, i) => vendida(i + 1)), colgada(20)])).p90).toBe(9 * D);
  });

  it("sin ventas, o con una curva que no baja de la mitad, los tres cortes son nulos", () => {
    expect(cortes(kaplanMeier([colgada(3), colgada(10)]))).toEqual({ p50: null, p75: null, p90: null });
    expect(cortes(kaplanMeier([]))).toEqual({ p50: null, p75: null, p90: null });
    // 1 de 4 vendida: S = 0,75.
    expect(cortes(kaplanMeier([vendida(1), colgada(5), colgada(6), colgada(7)]))).toEqual({ p50: null, p75: null, p90: null });
  });
});

describe("nivelPorVentas (unidades vendidas con edad conocida)", () => {
  it.each<[number, NivelConfianza | null]>([
    [0, null],
    [1, "pocos_datos"],
    [9, "pocos_datos"],
    [10, "aceptable"],
    [19, "aceptable"],
    [20, "solido"],
    [250, "solido"],
  ])("%i vendidas → %s", (n, nivel) => {
    expect(nivelPorVentas(n)).toBe(nivel);
  });
});

/** `n` vendidas, una por día desde el día 1 (llega a los tres cortes). */
const todasVendidas = (n: number) => Array.from({ length: n }, (_, i) => vendida(i + 1));
/** `n` vendidas y `n` que siguen colgadas al día 100: S termina en 0,5, sin P75 ni P90. */
const sinP90 = (n: number) => [...todasVendidas(n), ...Array.from({ length: n }, () => colgada(100))];

describe("elegirVentana", () => {
  const vara = (dias: number, obs: Observacion[]): Vara => construirVara(obs, dias);

  it("elige la más corta con 20 vendidas con edad conocida y los tres cortes", () => {
    const v = elegirVentana([vara(30, todasVendidas(25)), vara(60, todasVendidas(40)), vara(90, todasVendidas(50)), vara(120, todasVendidas(60))]);
    expect(v.ventanaDias).toBe(30);
    expect(v.nivel).toBe("solido");
  });

  it("con menos de 20 vendidas no le alcanza, aunque tenga los tres cortes", () => {
    const v = elegirVentana([vara(30, todasVendidas(15)), vara(60, todasVendidas(25)), vara(90, todasVendidas(30)), vara(120, todasVendidas(30))]);
    expect(v.ventanaDias).toBe(60);
  });

  it("con 20 vendidas pero sin el P90 tampoco le alcanza", () => {
    const v = elegirVentana([vara(30, sinP90(25)), vara(60, todasVendidas(30)), vara(90, todasVendidas(30)), vara(120, todasVendidas(30))]);
    expect(v.ventanaDias).toBe(60);
  });

  it("si ninguna alcanza, usa 120 días (aunque le falten cortes o ventas)", () => {
    const v = elegirVentana([vara(30, todasVendidas(3)), vara(60, sinP90(25)), vara(90, todasVendidas(12)), vara(120, sinP90(30))]);
    expect(v.ventanaDias).toBe(120);
    expect(v.cortes.p90).toBeNull();
  });

  it("armada al pedir cada ventana da lo mismo, y no calcula las ventanas que no necesita", () => {
    const casos: Record<number, Observacion[]>[] = [
      { 30: todasVendidas(25), 60: todasVendidas(40), 90: todasVendidas(50), 120: todasVendidas(60) },
      { 30: todasVendidas(15), 60: sinP90(25), 90: todasVendidas(30), 120: todasVendidas(30) },
      { 30: todasVendidas(3), 60: sinP90(25), 90: todasVendidas(12), 120: sinP90(30) },
      {},
    ];
    for (const caso of casos) {
      const pedidas: number[] = [];
      const perezosa = varaPorVentanas((d) => (pedidas.push(d), caso[d] ?? []));
      const todas = elegirVentana([30, 60, 90, 120].map((d) => construirVara(caso[d] ?? [], d)));
      expect(perezosa).toEqual(todas);
      expect(pedidas).toEqual([30, 60, 90, 120].filter((d) => d <= todas.ventanaDias));
    }
  });

  it("no depende del orden en que llegan las ventanas", () => {
    const v = elegirVentana([vara(120, todasVendidas(60)), vara(60, todasVendidas(25)), vara(30, todasVendidas(5)), vara(90, todasVendidas(40))]);
    expect(v.ventanaDias).toBe(60);
  });
});

describe("tramoDe (por los cortes de su categoría en su sede)", () => {
  const c = { p50: 5 * D, p75: 10 * D, p90: 20 * D };
  it.each<[number, Tramo]>([
    [0, "nueva"],
    [4.9, "nueva"],
    [5, "vigente"],
    [9.9, "vigente"],
    [10, "envejecida"],
    [20, "critica"],
    [90, "critica"],
  ])("%s días → %s", (dias, tramo) => {
    expect(tramoDe(dias * D, c, 30 * D)).toEqual({ tramo, alMenos: false });
  });

  it("un corte que la curva no alcanza queda después de su observación más larga: antes de eso el tramo es exacto; después, «al menos» el tramo que ya pasó (revisión 4)", () => {
    const sinP90 = { p50: 5 * D, p75: 10 * D, p90: null };
    expect(tramoDe(14 * D, sinP90, 15 * D)).toEqual({ tramo: "envejecida", alMenos: false });
    // Pasó el P75 y todo lo que la curva vio: por lo menos Envejecida (antes: null, «aún sin referencia»).
    expect(tramoDe(16 * D, sinP90, 15 * D)).toEqual({ tramo: "envejecida", alMenos: true });
    expect(tramoDe(70 * D, { p50: 10 * D, p75: 30 * D, p90: null }, 45 * D)).toEqual({ tramo: "envejecida", alMenos: true });
    expect(tramoDe(70 * D, { p50: 10 * D, p75: null, p90: null }, 45 * D)).toEqual({ tramo: "vigente", alMenos: true });
  });

  it("en el borde exacto (segundos = tMax) el tramo sigue siendo exacto: la prenda más vieja es la observación más larga (revisión 4, mutante w20)", () => {
    expect(tramoDe(10 * D, { p50: 2 * D, p75: null, p90: null }, 10 * D)).toEqual({ tramo: "vigente", alMenos: false });
  });

  it("con tolerancia: un error de coma flotante de 1e-11 no cambia el tramo, ni en tMax ni en un corte (revisión 4)", () => {
    // El caso real: reloj 345223.80700000003 contra tMax 345223.807.
    expect(tramoDe(345223.80700000003, { p50: 3 * D, p75: null, p90: null }, 345223.807)).toEqual({ tramo: "vigente", alMenos: false });
    // El espejo: un reloj que debía ser igual al P50 y quedó 1e-11 abajo ya es Vigente.
    expect(tramoDe(5 * D - 1e-11, c, 30 * D)).toEqual({ tramo: "vigente", alMenos: false });
    // Un segundo sí cuenta.
    expect(tramoDe(5 * D - 1, c, 30 * D)).toEqual({ tramo: "nueva", alMenos: false });
    expect(tramoDe(10 * D + 1, { p50: 2 * D, p75: null, p90: null }, 10 * D)).toEqual({ tramo: "vigente", alMenos: true });
  });

  it("sin P50 (su categoría no vendió ni la mitad) nadie tiene tramo: «aún sin referencia», nunca «Nueva» (ADR-0208, decisión 6)", () => {
    for (const dias of [0, 3, 14, 59]) {
      expect(tramoDe(dias * D, { p50: null, p75: null, p90: null }, 60 * D)).toBeNull();
      expect(tramoDe(dias * D, { p50: null, p75: 10 * D, p90: 20 * D }, 60 * D)).toBeNull();
    }
  });
});

describe("excluirTardias (por el movimiento de la bajada, no por la hora)", () => {
  // Día 1: 2 colgadas de antes (bajada A). A las 10:00, bajada X de 5; ventas a las 10:03, 10:07 y 10:20.
  const eventos = [
    bajada(1, 2, { oid: "A" }),
    bajada(1, 5, { oid: "X" }, 600),
    venta(1, 1, 603),
    venta(1, 1, 607),
    venta(1, 1, 620),
  ];
  const nivel = (es: EventoPiso[]) => es.reduce((s, e) => s + e.delta, 0);

  it("resta sus unidades tardías de la bajada y de las ventas de [t, t + 10 min], empezando por la última", () => {
    const r = excluirTardias(eventos, new Map([["X", 2]]));
    expect(r.map((e) => [e.ts, e.delta])).toEqual([
      [ts(1), 2],
      [ts(1, 600), 3],
      [ts(1, 620), -1],
    ]);
    expect(nivel(r)).toBe(nivel(eventos));
  });

  it("con 1 tardía se quita la venta de las 10:07 y queda la de las 10:03", () => {
    const r = excluirTardias(eventos, new Map([["X", 1]]));
    expect(r.filter((e) => e.esVenta).map((e) => e.ts)).toEqual([ts(1, 603), ts(1, 620)]);
    expect(r.find((e) => e.oid === "X")?.delta).toBe(4);
  });

  it("una venta fuera de los 10 minutos nunca se toca, y lo quitado se topa por lo vendido en la ventana", () => {
    const r = excluirTardias(eventos, new Map([["X", 5]]));
    expect(r.find((e) => e.oid === "X")?.delta).toBe(3);
    expect(r.filter((e) => e.esVenta).map((e) => e.ts)).toEqual([ts(1, 620)]);
  });

  it("un oid que no es de esta talla, o sin tardías, no cambia nada", () => {
    expect(excluirTardias(eventos, new Map([["OTRO", 2]]))).toEqual(eventos);
    expect(excluirTardias(eventos, new Map())).toEqual(eventos);
  });
});

describe("unidadesParaVara y recortarEventos (sobre el único FIFO)", () => {
  it("los días guardada en el almacén no cuentan: se vende con los días que estuvo colgada", () => {
    const obs = observacionesDe([bajada(0, 1), ev(2, -1, { esMovimientoInterno: true }), bajada(5, 1), venta(6, 1)], ts(10));
    expect(obs).toEqual([{ segundos: 3 * D, vendida: true, peso: 1 }]);
  });

  it("lo que sigue colgado entra como «al menos» sus segundos, y lo que tiene edad desconocida no entra", () => {
    const obs = observacionesDe([bajada(0, 2), bajada(1, 3, { edadDesconocida: true }), venta(4, 2), venta(5, 1)], ts(10));
    expect(obs).toEqual([
      { segundos: 4 * D, vendida: true, peso: 2 },
      // la venta del día 5 salió de la carga (edad desconocida): no entra
    ]);
    const conResto = observacionesDe([bajada(0, 2), venta(4, 1)], ts(10));
    expect(conResto).toEqual([
      { segundos: 4 * D, vendida: true, peso: 1 },
      { segundos: 10 * D, vendida: false, peso: 1 },
    ]);
  });

  it("sus observaciones NO vienen ordenadas: primero las salidas y después lo colgado (por eso curvaSin ordena, revisión 4)", () => {
    expect(observacionesDe([bajada(0, 1), venta(30, 1), bajada(110, 1)], ts(120)).map((o) => o.segundos / D)).toEqual([30, 10]);
  });

  it("cuenta aparte las ventas que salieron de lo que tiene edad desconocida (el FIFO vende primero lo de la carga)", () => {
    // 3 de la carga inicial, 2 bajadas después con edad conocida; se venden 3: las 3 salen de la carga.
    const u = unidadesParaVara([bajada(0, 3, { edadDesconocida: true }), bajada(10, 2), venta(12, 1), venta(14, 1), venta(16, 1)], ts(20));
    expect(u).toEqual({ observaciones: [{ segundos: 10 * D, vendida: false, peso: 2 }], ventasSinEdad: 3 });
    // Una pérdida de lo desconocido no es una venta.
    expect(unidadesParaVara([bajada(0, 2, { edadDesconocida: true }), ev(3, -1)], ts(5)).ventasSinEdad).toBe(0);
  });

  it("recortar la ventana convierte lo que había antes en un saldo de edad desconocida", () => {
    const r = recortarEventos([bajada(0, 3), venta(2, 1), bajada(20, 2)], ts(10));
    expect(r[0]).toEqual({ ts: ts(10), delta: 2, esVenta: false, esMovimientoInterno: false, edadDesconocida: true });
    expect(r.slice(1)).toEqual([bajada(20, 2)]);
    expect(observacionesDe(r, ts(25))).toEqual([{ segundos: 5 * D, vendida: false, peso: 2 }]);
  });
});

describe("relojNovedad (modelo+color en la sede)", () => {
  const desde = ts(0);

  it("los días agotada o guardada en el almacén no cuentan", () => {
    const talla = [bajada(0, 2), venta(2, 2), bajada(5, 1), ev(6, -1, { esMovimientoInterno: true }), bajada(8, 1)];
    expect(relojNovedad({ eventosPorTalla: [talla], primeraExhibicion: ts(0), desde, ahora: ts(10) })).toEqual({ segundos: 5 * D, alMenos: false });
  });

  it("suma las tallas: cuenta el tiempo con ALGUNA talla colgada, no la suma de cada una", () => {
    const s = [bajada(0, 1), venta(3, 1)];
    const m = [bajada(2, 1), venta(6, 1)];
    expect(relojNovedad({ eventosPorTalla: [s, m], primeraExhibicion: ts(0), desde, ahora: ts(10) }).segundos).toBe(6 * D);
  });

  it("dice «al menos» si la primera exhibición es anterior a la ventana", () => {
    const r = relojNovedad({ eventosPorTalla: [[ev(0, 2, { edadDesconocida: true })]], primeraExhibicion: ts(-40), desde, ahora: ts(10) });
    expect(r).toEqual({ segundos: 10 * D, alMenos: true });
  });

  it("…también si lo primero que entró EN la ventana tiene edad conocida: colgada hace 40 días, agotada, y bajada otra vez hace 5", () => {
    // La primera entrada de la ventana es una bajada normal; lo que dice «al menos» es la primera exhibición, de antes.
    const r = relojNovedad({ eventosPorTalla: [[bajada(5, 2)]], primeraExhibicion: ts(-40), desde, ahora: ts(10) });
    expect(r).toEqual({ segundos: 5 * D, alMenos: true });
  });

  it("dice «al menos» si lo primero que entró tiene edad desconocida (carga inicial, saldo, ajuste)", () => {
    expect(relojNovedad({ eventosPorTalla: [[bajada(3, 2, { edadDesconocida: true })]], primeraExhibicion: ts(3), desde, ahora: ts(10) }).alMenos).toBe(true);
  });

  it("una primera bajada TARDÍA no es edad desconocida (ADR-0248, decisión 3): el fardo nuevo que se vende a los 3 minutos sigue pudiendo ser Nueva", () => {
    const fardo = [bajada(3, 5, { oid: "T" }), venta(3, 1, 3)];
    expect(relojNovedad({ eventosPorTalla: [fardo], primeraExhibicion: ts(3), desde, ahora: ts(5) })).toEqual({ segundos: 2 * D, alMenos: false });
    expect(estadoFrescura(entrada({ reloj: relojNovedad({ eventosPorTalla: [fardo], primeraExhibicion: ts(3), desde, ahora: ts(5) }) }))).toMatchObject({
      tipo: "semaforo",
      tramo: "nueva",
      alMenos: false,
    });
  });

  it("se suma en milisegundos enteros: da exactamente la exposición de la unidad que sigue colgada (revisión 4)", () => {
    // La salida real que salía 1e-11 arriba sumando tramos ya divididos entre 1000.
    const talla = [
      { ts: "2026-06-25T19:26:15.951Z", delta: 3, esVenta: false, esMovimientoInterno: true },
      { ts: "2026-06-28T15:44:48.420Z", delta: -1, esVenta: true, esMovimientoInterno: false },
      { ts: "2026-06-29T06:08:26.374Z", delta: -1, esVenta: true, esMovimientoInterno: false },
    ];
    const ahora = "2026-06-29T19:19:59.758Z";
    const r = relojNovedad({ eventosPorTalla: [talla], primeraExhibicion: talla[0].ts, desde: "2026-03-01T00:00:00.000Z", ahora });
    expect(r.segundos).toBe((Date.parse(ahora) - Date.parse(talla[0].ts)) / 1000);
    expect(r.segundos).toBe(Math.max(...observacionesDe(talla, ahora).map((o) => o.segundos)));
  });

  it("un ajuste al piso DESPUÉS de una primera exhibición conocida no la vuelve desconocida", () => {
    const talla = [bajada(1, 1), ev(4, 1, { edadDesconocida: true })];
    expect(relojNovedad({ eventosPorTalla: [talla], primeraExhibicion: ts(1), desde, ahora: ts(10) })).toEqual({ segundos: 9 * D, alMenos: false });
  });
});

const VARA_5_10_20 = { cortes: { p50: 5 * D, p75: 10 * D, p90: 20 * D }, nivel: "solido" as NivelConfianza | null, curva: { tMax: 60 * D } };
const entrada = (o: Partial<EntradaEstado> = {}): EntradaEstado => ({
  dudosa: false,
  esClasico: false,
  temporada: "verano",
  finEstacion: null,
  enEstacionAhora: null,
  ahora: ts(100),
  vara: VARA_5_10_20,
  reloj: { segundos: 2 * D, alMenos: false },
  rapidez: null,
  pisoHoy: 3,
  almacenHoy: 0,
  ...o,
});

describe("una prenda repuesta no vuelve a Nueva", () => {
  it("colgada 7 días, agotada y repuesta hoy: sigue con sus 8 días (Vigente), no con el día de la reposición", () => {
    const talla = [bajada(0, 3), venta(3, 1), venta(7, 2), bajada(20, 2)];
    const reloj = relojNovedad({ eventosPorTalla: [talla], primeraExhibicion: ts(0), desde: ts(0), ahora: ts(21) });
    expect(reloj).toEqual({ segundos: 8 * D, alMenos: false });
    const e = estadoFrescura(entrada({ reloj }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "vigente" });
  });
});

describe("la edad desconocida nunca da «Nueva»", () => {
  it("con el reloj debajo del P50 y edad desconocida: «sin edad conocida», nunca Nueva", () => {
    expect(estadoFrescura(entrada({ reloj: { segundos: 2 * D, alMenos: true } })).tipo).toBe("sin_edad_conocida");
    expect(estadoFrescura(entrada({ reloj: { segundos: 2 * D, alMenos: false } }))).toMatchObject({ tipo: "semaforo", tramo: "nueva" });
  });

  it("sí puede subir de tramo: «al menos 12 días» ya es Envejecida", () => {
    expect(estadoFrescura(entrada({ reloj: { segundos: 12 * D, alMenos: true } }))).toMatchObject({ tipo: "semaforo", tramo: "envejecida", alMenos: true });
  });

  it("ningún reloj con edad desconocida da Nueva, sea cual sea la vara", () => {
    for (const dias of [0, 1, 4.99, 5, 30]) {
      for (const cortesVara of [VARA_5_10_20.cortes, { p50: null, p75: null, p90: null }, { p50: 50 * D, p75: 60 * D, p90: 70 * D }]) {
        const e = estadoFrescura(entrada({ reloj: { segundos: dias * D, alMenos: true }, vara: { ...VARA_5_10_20, cortes: cortesVara } }));
        expect(e.tipo === "semaforo" && e.tramo === "nueva").toBe(false);
      }
    }
  });
});

describe("rapidez (vendidas contra esperadas a la misma edad, contra el RESTO de su categoría)", () => {
  // Categoría: A vendió a los 1 y 2 días; B vendió a los 4 y le queda 1 colgada desde hace 5; C vendió a los 1 y 3 y le
  // queda 1 colgada desde hace 6. Cada una se mide contra las OTRAS dos:
  //   A contra B + C (5 unidades): H(1) = 1/5; H(3) = 1/5 + 1/4; H(4) = 1/5 + 1/4 + 1/3.
  //     A vendió 2; esperadas H(1) + H(2) = 0,2 + 0,2 = 0,4 → 500.
  //   B contra A + C (5 unidades): H(1) = 2/5; H(2) = 2/5 + 1/3; H(3) = 2/5 + 1/3 + 1/2 = 1,2333.
  //     B vendió 1; esperadas H(4) + H(5) = 2,4667 → 41.
  const a = [vendida(1), vendida(2)];
  const b = [vendida(4), colgada(5)];
  const c = [vendida(1), vendida(3), colgada(6)];
  const curva = kaplanMeier([...a, ...b, ...c]);

  it("coincide con el cálculo a mano", () => {
    // referencia: las ventas del RESTO (B + C = 3; A + C = 4).
    expect(rapidez(a, curvaSin(curva, a))).toEqual({ indice: 500, vendidas: 2, esperadas: 0.4, referencia: 3 });
    expect(rapidez(b, curvaSin(curva, b))).toEqual({ indice: 41, vendidas: 1, esperadas: 2.47, referencia: 4 });
  });

  it("curvaSin da lo mismo que armar la curva sin la prenda (restando instante por instante, sin reordenar)", () => {
    for (const [propias, resto] of [
      [a, [...b, ...c]],
      [b, [...a, ...c]],
      [c, [...a, ...b]],
    ] as const) {
      const sin = curvaSin(curva, propias);
      const armada = kaplanMeier(resto);
      expect(sin.tiempos).toEqual(armada.tiempos);
      sin.riesgoAcumulado.forEach((x, i) => expect(x).toBeCloseTo(armada.riesgoAcumulado[i], 12));
      expect(sin.vendidas).toBe(armada.vendidas);
    }
  });

  it("…también con las unidades propias DESORDENADAS, como las devuelve unidadesParaVara (revisión 4, mutante x20)", () => {
    const d = [vendida(30), colgada(3), vendida(6)];
    const curvaD = kaplanMeier([...a, ...b, ...d]);
    const sin = curvaSin(curvaD, d);
    const armada = kaplanMeier([...a, ...b]);
    expect(sin.tiempos).toEqual(armada.tiempos);
    sin.riesgoAcumulado.forEach((x, i) => expect(x).toBeCloseTo(armada.riesgoAcumulado[i], 12));
    expect(rapidez(d, sin)).toEqual(rapidez(d, armada));
  });

  it("sin dato si alguna de sus ventas salió de lo que tiene edad desconocida, aunque lo repuesto parezca sin vender", () => {
    expect(rapidez([colgada(25, 4)], curvaSin(curva, []))?.indice).toBe(0);
    expect(rapidez([colgada(25, 4)], curvaSin(curva, []), 1)).toBeNull();
  });

  it("la única prenda de su categoría no se compara contra sí misma: sin dato, nunca «pilar» (con ella adentro daba 100 exacto)", () => {
    const sola = [vendida(3), vendida(7), colgada(20, 2)];
    expect(rapidez(sola, kaplanMeier(sola))?.indice).toBe(100); // la identidad que escondía todo
    expect(rapidez(sola, curvaSin(kaplanMeier(sola), sola))).toBeNull();
  });

  it("recién colgada y sin ventas no es «lenta»: es «sin dato»", () => {
    const resto = curvaSin(curva, []);
    expect(rapidez([colgada(0.5)], resto)).toBeNull();
    expect(rapidez([colgada(1.5)], kaplanMeier([...a, ...b]))).toBeNull(); // esperaba 0,25: poca evidencia
    expect(rapidez([], resto)).toBeNull();
  });
});

/** Una rapidez medida contra `referencia` ventas del resto de su categoría (20: «Sólido»). */
const r = (indice: number, referencia = 20): Rapidez => ({ indice, vendidas: 1, esperadas: 1, referencia });

describe("estaQuieta: vieja Y lenta, o temporada pasada; un pilar nunca", () => {
  it("un pilar de venta nunca está quieto, aunque sea Crítica y de temporada pasada", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: true, rapidez: r(150), pisoHoy: 4 })).toBe(false);
    expect(estaQuieta({ tramo: "envejecida", temporadaPasada: false, rapidez: r(100), pisoHoy: 4 })).toBe(false);
  });

  it("Envejecida o Crítica y más lenta que su categoría: quieta; Vigente o Nueva, no", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: r(60), pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "envejecida", temporadaPasada: false, rapidez: r(99), pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "vigente", temporadaPasada: false, rapidez: r(20), pisoHoy: 4 })).toBe(false);
  });

  it("sin dato de rapidez no es «lenta» (el éxito de la carga inicial no va al perchero); la temporada pasada sí cuenta", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: null, pisoHoy: 4 })).toBe(false);
    expect(estaQuieta({ tramo: null, temporadaPasada: true, rapidez: null, pisoHoy: 4 })).toBe(true);
  });

  it("sin nada en el piso no hay nada quieto en el piso", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: true, rapidez: r(10), pisoHoy: 0 })).toBe(false);
  });

  it("sin dato de rapidez, una prenda vieja sugiere «revisa sus ventas», nunca «Trasladar»", () => {
    const e = estadoFrescura(entrada({ reloj: { segundos: 30 * D, alMenos: false }, rapidez: null, almacenHoy: 5 }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: false, sugerencias: ["revisar_ventas"] });
  });
});

describe("«Trasladar» solo con «Sólido» (en la vara Y en la referencia que midió su rapidez) y algo en el almacén", () => {
  const PERMITIDAS: readonly Sugerencia[] = ["revisar_ventas", "cambiar_lugar", "trasladar", "retirar", "guardar_hasta_su_estacion"];

  it("en ninguna combinación aparece sin «Sólido», sin almacén o sin dato de rapidez; y «Rebajar» no existe", () => {
    let vistas = 0;
    for (const nivel of [null, "pocos_datos", "aceptable", "solido"] as const)
      for (const almacenHoy of [0, 3])
        for (const rap of [null, r(40), r(150), r(40, 19), r(40, 2)])
          for (const tramo of [null, "nueva", "vigente", "envejecida", "critica"] as const)
            for (const temporadaPasada of [false, true])
              for (const pisoHoy of [0, 2]) {
                const quieta = estaQuieta({ tramo, temporadaPasada, rapidez: rap, pisoHoy });
                const s = sugerenciasDe({ quieta, tramo, temporadaPasada, fueraDeSuEstacion: false, rapidez: rap, nivel, pisoHoy, almacenHoy });
                for (const x of s) expect(PERMITIDAS).toContain(x);
                if (s.includes("trasladar")) {
                  vistas++;
                  expect(nivel).toBe("solido");
                  expect(almacenHoy).toBeGreaterThan(0);
                  expect(rap).not.toBeNull();
                  expect(rap!.referencia).toBeGreaterThanOrEqual(20);
                }
              }
    expect(vistas).toBeGreaterThan(0);
  });

  it("por el estado: Crítica y lenta con 3 en el almacén se traslada solo si la vara es «Sólido»", () => {
    const base = { reloj: { segundos: 30 * D, alMenos: false }, rapidez: r(40), almacenHoy: 3 };
    expect(estadoFrescura(entrada(base)).sugerencias).toEqual(["cambiar_lugar", "trasladar"]);
    expect(estadoFrescura(entrada({ ...base, vara: { ...VARA_5_10_20, nivel: "aceptable" } })).sugerencias).toEqual(["cambiar_lugar"]);
    expect(estadoFrescura(entrada({ ...base, almacenHoy: 0 })).sugerencias).toEqual(["cambiar_lugar"]);
    // Vara «Sólido», pero su rapidez se midió contra 19 ventas del resto: no se traslada.
    expect(estadoFrescura(entrada({ ...base, rapidez: r(40, 19) })).sugerencias).toEqual(["cambiar_lugar"]);
  });
});

describe("temporada: aviso aparte, nunca parte la vara", () => {
  it("sin temporada: sin aviso de fin de estación y con la marca «sin temporada»", () => {
    const e = estadoFrescura(entrada({ temporada: null, finEstacion: ts(50), reloj: { segundos: 30 * D, alMenos: false } }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "critica", temporadaPasada: false, sinTemporada: true });
    expect(e.sugerencias).not.toContain("retirar");
  });

  it("terminó la estación de su última llegada: «Temporada pasada», quieta, con cambiar de lugar y retirar", () => {
    const e = estadoFrescura(entrada({ finEstacion: ts(90), reloj: { segundos: 3 * D, alMenos: false } }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "nueva", temporadaPasada: true, sinTemporada: false, quieta: true });
    expect(e.sugerencias).toEqual(["revisar_ventas", "cambiar_lugar", "retirar"]);
    expect(estadoFrescura(entrada({ finEstacion: ts(120) })).temporadaPasada).toBe(false);
  });

  it("el bikini que se sigue vendiendo bien después del 20 de marzo (un pilar de temporada pasada): avisa y sugiere retirarlo (ADR-0246, decisión 10)", () => {
    const e = estadoFrescura(entrada({ finEstacion: ts(90), reloj: { segundos: 12 * D, alMenos: false }, rapidez: r(180), almacenHoy: 3 }));
    // Pendiente de Felipe: si un pilar de temporada pasada cuenta en «Por decidir». Hoy no (un pilar nunca va al perchero).
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "envejecida", temporadaPasada: true, quieta: false, sugerencias: ["retirar"] });
    // Sin nada en el piso no hay nada que retirar del piso.
    expect(estadoFrescura(entrada({ finEstacion: ts(90), rapidez: r(180), pisoHoy: 0 })).sugerencias).toEqual([]);
  });

  it("un clásico nunca pasa a «Temporada pasada»; fuera de su estación se sugiere guardarlo", () => {
    const e = estadoFrescura(entrada({ esClasico: true, temporada: "clasico_verano", finEstacion: ts(90), enEstacionAhora: false }));
    expect(e).toMatchObject({ tipo: "clasico", fueraDeSuEstacion: true, temporadaPasada: false, quieta: false, sugerencias: ["guardar_hasta_su_estacion"] });
    expect(estadoFrescura(entrada({ esClasico: true, temporada: "clasico_todo_el_anio", enEstacionAhora: null })).sugerencias).toEqual([]);
  });

  it("dudosa no se juzga, y una categoría sin ventas en la sede no tiene semáforo", () => {
    expect(estadoFrescura(entrada({ dudosa: true })).tipo).toBe("dudosa");
    expect(estadoFrescura(entrada({ vara: { ...VARA_5_10_20, nivel: null } })).tipo).toBe("sin_ventas_sede");
    expect(estadoFrescura(entrada({ vara: { ...VARA_5_10_20, cortes: { p50: null, p75: null, p90: null } } })).tipo).toBe("sin_vara");
  });

  it("pasado todo lo que la curva vio y sin el corte siguiente: «al menos» el tramo que ya pasó, con «revisa sus ventas» si es vieja (revisión 4; antes «aún sin referencia»)", () => {
    const sinP75 = { ...VARA_5_10_20, cortes: { p50: 5 * D, p75: null, p90: null } };
    expect(estadoFrescura(entrada({ reloj: { segundos: 70 * D, alMenos: false }, vara: sinP75 }))).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: true });
    const sinP90 = { ...VARA_5_10_20, cortes: { p50: 10 * D, p75: 30 * D, p90: null }, curva: { tMax: 45 * D } };
    const e = estadoFrescura(entrada({ reloj: { segundos: 70 * D, alMenos: true }, vara: sinP90 }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "envejecida", alMenos: true, quieta: false, sugerencias: ["revisar_ventas"] });
  });
});

describe("leer lo que devuelve la base", () => {
  it("el Taller devuelve solo `separa_piso: false`; una forma rara es un fallo (null), no una sede vacía", () => {
    expect(leerFrescuraSede({ separa_piso: false })).toEqual({ separaPiso: false });
    expect(leerFrescuraSede(null)).toBeNull();
    expect(leerFrescuraSede({ separa_piso: true, desde: "ayer", ahora: ts(1), prendas: [] })).toBeNull();
    expect(leerFrescuraSede({ separa_piso: true, desde: ts(0), ahora: ts(1) })).toBeNull();
    // Sin la clave `separa_piso` (o con otro nombre) es un fallo, NUNCA «no separa piso»: si no, la sede desaparecería sin
    // aviso y la referencia de CAYLA se armaría con una tienda menos.
    expect(leerFrescuraSede({})).toBeNull();
    expect(leerFrescuraSede({ desde: ts(0), ahora: ts(1), prendas: [] })).toBeNull();
    expect(leerFrescuraSede({ separaPiso: false })).toBeNull();
  });

  it("traduce las marcas (1 venta, 2 interno, 4 edad desconocida) y el oid, y descarta lo que no tiene forma", () => {
    const l = leerFrescuraSede({
      separa_piso: true,
      desde: ts(0),
      ahora: ts(10),
      prendas: [{ variante_id: "v1", producto_id: "p1", producto_nombre: "Blusa", color_codigo: null, es_clasico: false, piso_hoy: 2, almacen_hoy: "1" }, { producto_id: "sin-variante" }],
      eventos: { v1: [[ts(1), 3, 6, "m1"], [ts(2), -1, 1, null], ["no es fecha", 1, 0, null], [ts(3), 0, 0, null]] },
      tardias: [{ oid: "m1", variante_id: "v1", bajada_en: ts(1), unidades_tardias: 1 }, { oid: "m2", variante_id: "v1", unidades_tardias: 0 }],
      dudosas: ["v9", 3],
    });
    expect(l?.separaPiso).toBe(true);
    if (!l || !l.separaPiso) return;
    expect(l.tallas).toHaveLength(1);
    expect(l.tallas[0]).toMatchObject({ varianteId: "v1", colorCodigo: null, pisoHoy: 2, almacenHoy: 1, temporada: null, temporadaOrigen: null });
    expect(l.eventos.v1).toEqual([
      { ts: ts(1), delta: 3, esVenta: false, esMovimientoInterno: true, edadDesconocida: true, oid: "m1" },
      { ts: ts(2), delta: -1, esVenta: true, esMovimientoInterno: false, edadDesconocida: false },
    ]);
    expect(l.tardias).toEqual([{ oid: "m1", varianteId: "v1", bajadaEn: ts(1), unidadesTardias: 1 }]);
    expect(l.dudosas).toEqual(["v9"]);
  });

  it("lee el indicador de registro por sede y mes", () => {
    expect(
      leerConfianzaRegistro([
        { ubicacion_id: "u1", sede: "Tienda Trujillo", mes: "2026-09-01", filas: 25, unidades: 104, tardias: 8, confianza: 0.923, nivel: "solido" },
        { ubicacion_id: "u2", sede: "Tienda Lima", mes: "2026-09-01", filas: 0, unidades: 0, tardias: 0, confianza: null, nivel: null },
        { sede: "sin id" },
      ]),
    ).toEqual([
      { ubicacionId: "u1", sede: "Tienda Trujillo", mes: "2026-09-01", filas: 25, unidades: 104, tardias: 8, confianza: 0.923, nivel: "solido" },
      { ubicacionId: "u2", sede: "Tienda Lima", mes: "2026-09-01", filas: 0, unidades: 0, tardias: 0, confianza: null, nivel: null },
    ]);
  });
});

// Una sede de prueba, a 120 días. Hoy es el día 120; la ventana empieza el día 0.
const talla = (varianteId: string, productoId: string, o: Partial<TallaFrescuraCruda> = {}): TallaFrescuraCruda => ({
  varianteId,
  productoId,
  productoNombre: productoId,
  codigo: null,
  colorCodigo: "NEG",
  colorNombre: "Negro",
  talla: "M",
  categoriaId: "blusas",
  categoriaNombre: "Blusas",
  temporada: "primavera_verano",
  temporadaOrigen: "producto",
  esClasico: false,
  finEstacion: null,
  enEstacionAhora: true,
  primeraExhibicion: null,
  ultimaLlegada: null,
  pisoHoy: 0,
  almacenHoy: 0,
  ...o,
});

function sedeDePrueba(): LecturaFrescuraConPiso {
  const tallas: TallaFrescuraCruda[] = [];
  const eventos: Record<string, EventoPiso[]> = {};
  // 10 blusas que se vendieron: 5 unidades colgadas el día 20, una venta por día a los 1, 2, 3, 4 y 5 días.
  // Curva: P50 = 3 días, P75 = P90 = 5 días (50 vendidas con edad conocida: «Sólido», solo en la ventana de 120).
  for (let i = 0; i < 10; i++) {
    const v = `vend-${i}`;
    tallas.push(talla(v, `vendedora-${i}`, { primeraExhibicion: ts(20) }));
    eventos[v] = [bajada(20, 5, { oid: `b-${i}` }), venta(21, 1), venta(22, 1), venta(23, 1), venta(24, 1), venta(25, 1)];
  }
  // La vieja: 4 colgadas hace 30 días, ninguna venta, 2 en el almacén.
  tallas.push(talla("vieja", "vieja", { primeraExhibicion: ts(90), pisoHoy: 4, almacenHoy: 2 }));
  eventos.vieja = [bajada(90, 4, { oid: "b-vieja" })];
  // La de la carga inicial: 3 colgadas hace 2 días, con edad desconocida.
  tallas.push(talla("carga", "carga", { primeraExhibicion: ts(118), pisoHoy: 3, temporada: null, temporadaOrigen: null }));
  eventos.carga = [bajada(118, 3, { edadDesconocida: true })];
  // Un clásico que vende muchísimo: no entra a la vara de las blusas.
  tallas.push(talla("clasico", "clasico", { primeraExhibicion: ts(100), pisoHoy: 1, esClasico: true, temporada: "clasico_todo_el_anio" }));
  eventos.clasico = [bajada(100, 20), ...Array.from({ length: 19 }, (_, i) => venta(100, 1, (i + 1) * 30))];
  // Una dudosa: su libro no cuadra.
  tallas.push(talla("dudosa", "dudosa", { primeraExhibicion: ts(110), pisoHoy: 1 }));
  eventos.dudosa = [bajada(110, 1), venta(110, 2, 60)];
  return { separaPiso: true, desde: ts(0), ahora: ts(120), tallas, eventos, tardias: [], dudosas: ["dudosa"] };
}

describe("analizarSede", () => {
  const { sede, observaciones } = analizarSede(sedeDePrueba());
  const prenda = (productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;

  it("arma la vara de la categoría sin clásicos ni dudosas, en la ventana más corta que alcanza", () => {
    expect(sede.categorias).toEqual([
      expect.objectContaining({ categoriaId: "blusas", ventanaDias: 120, cortes: { p50: 3 * D, p75: 5 * D, p90: 5 * D }, vendidas: 50, nivel: "solido" }),
    ]);
  });

  it("la vieja es Crítica, lenta y quieta: se sugiere cambiarla de lugar y, con vara Sólido y almacén, trasladarla", () => {
    const p = prenda("vieja");
    expect(p.reloj).toEqual({ segundos: 30 * D, alMenos: false });
    expect(p.rapidez?.indice).toBe(0);
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true, sugerencias: ["cambiar_lugar", "trasladar"] });
  });

  it("la de la carga inicial dice «al menos 2 días» y nunca Nueva; lleva la marca «sin temporada»", () => {
    const p = prenda("carga");
    expect(p.reloj).toEqual({ segundos: 2 * D, alMenos: true });
    expect(p.estado).toMatchObject({ tipo: "sin_edad_conocida", sinTemporada: true, temporadaPasada: false });
  });

  it("el clásico y la dudosa tienen su propio estado y no llevan rapidez", () => {
    expect(prenda("clasico")).toMatchObject({ rapidez: null, estado: { tipo: "clasico" } });
    expect(prenda("dudosa")).toMatchObject({ rapidez: null, estado: { tipo: "dudosa" } });
  });

  it("las cifras de cabecera: edad del piso de la moda, % Nuevas sobre lo que tiene tramo y «por decidir»", () => {
    expect(sede.cifras).toEqual({
      unidadesEnPiso: 4 + 3 + 1 + 1,
      edadDelPisoDias: Math.round(((4 * 30 + 3 * 2) / 7) * 10) / 10,
      edadDelPisoAlMenos: true,
      unidadesNuevas: 0,
      unidadesConTramo: 4,
      pctNuevas: 0,
      porDecidir: 1,
    });
  });

  it("sus unidades con edad conocida quedan para la referencia de CAYLA (sin clásicos ni dudosas)", () => {
    expect(Object.keys(observaciones)).toEqual(["blusas"]);
    expect(observaciones.blusas.unidadesEn(120).filter((o) => o.vendida).reduce((s, o) => s + o.peso, 0)).toBe(50);
  });

  it("las bajadas tardías salen de la vara: la venta que las delató no es una venta de 0 días", () => {
    const l = sedeDePrueba();
    // Una bajada de 2 el día 119 que se vendió a los 3 minutos: tardía.
    l.tallas.push(talla("tarde", "tarde", { primeraExhibicion: ts(119) }));
    l.eventos.tarde = [bajada(119, 2, { oid: "b-tarde" }), venta(119, 2, 3)];
    const sinExcluir = analizarSede(l).observaciones.blusas.unidadesEn(30);
    expect(sinExcluir.filter((o) => o.vendida)).toHaveLength(1);
    l.tardias = [{ oid: "b-tarde", varianteId: "tarde", bajadaEn: ts(119), unidadesTardias: 2 }];
    const { sede: s2, observaciones: o2 } = analizarSede(l);
    expect(o2.blusas.unidadesEn(30).filter((o) => o.vendida)).toHaveLength(0);
    // Pero la prenda NO pasa a «edad desconocida» (ADR-0248, decisión 3): sale de la vara, no pierde la novedad.
    expect(s2.prendas.find((p) => p.productoId === "tarde")?.reloj.alMenos).toBe(false);
  });
});

/** Una lectura armada a mano: hoy es el día 120 y la ventana empieza el día 0. */
const lectura = (tallas: TallaFrescuraCruda[], eventos: Record<string, EventoPiso[]>, o: Partial<LecturaFrescuraConPiso> = {}): LecturaFrescuraConPiso => ({
  separaPiso: true,
  desde: ts(0),
  ahora: ts(120),
  tallas,
  eventos,
  tardias: [],
  dudosas: [],
  ...o,
});
/** 25 blusas colgadas una por día desde `desde` y vendidas a los 1-5 días: la vara de 30 días alcanza si empiezan el día 92. */
function varaDeBlusas(desde: number): { tallas: TallaFrescuraCruda[]; eventos: Record<string, EventoPiso[]> } {
  const tallas = Array.from({ length: 25 }, (_, i) => talla(`v${i}`, `p${i}`, { primeraExhibicion: ts(desde + i) }));
  const eventos = Object.fromEntries(tallas.map((t, i) => [t.varianteId, [bajada(desde + i, 1), venta(desde + i + 1 + (i % 5), 1)]]));
  return { tallas, eventos };
}

describe("analizarSede: el modelo+color con varias tallas", () => {
  it("la primera exhibición de la prenda es la más VIEJA de sus tallas: S colgada hace meses (hoy en el almacén) y M hace 5 días → «al menos»", () => {
    const vara = varaDeBlusas(1);
    const s = talla("S", "X", { talla: "S", primeraExhibicion: ts(-40), almacenHoy: 1 });
    const m = talla("M", "X", { talla: "M", primeraExhibicion: ts(115), pisoHoy: 2 });
    const { sede } = analizarSede(lectura([...vara.tallas, s, m], { ...vara.eventos, M: [bajada(115, 2)] }));
    const x = sede.prendas.find((p) => p.productoId === "X")!;
    expect(x.primeraExhibicion).toBe(ts(-40));
    expect(x.reloj.alMenos).toBe(true);
    expect(x.estado.tipo === "semaforo" && x.estado.tramo === "nueva").toBe(false);
  });

  it("la estación de la ÚLTIMA llegada de cualquiera de sus tallas manda: S del invierno pasado y M de este → no es «Temporada pasada»", () => {
    const s = talla("S", "X", { talla: "S", temporada: "invierno", finEstacion: ts(-100), primeraExhibicion: ts(1), pisoHoy: 1 });
    const m = talla("M", "X", { talla: "M", temporada: "invierno", finEstacion: ts(150), primeraExhibicion: ts(1), pisoHoy: 1 });
    const { sede } = analizarSede(lectura([s, m], { S: [bajada(1, 1)], M: [bajada(1, 1)] }));
    const x = sede.prendas.find((p) => p.productoId === "X")!;
    expect(x.finEstacion).toBe(ts(150));
    expect(x.estado.temporadaPasada).toBe(false);
  });

  it("una talla dudosa basta para no juzgar la prenda entera", () => {
    const s = talla("S", "X", { talla: "S", primeraExhibicion: ts(1), pisoHoy: 1 });
    const m = talla("M", "X", { talla: "M", primeraExhibicion: ts(1), pisoHoy: 1 });
    const { sede } = analizarSede(lectura([s, m], { S: [bajada(1, 1)], M: [bajada(1, 1)] }, { dudosas: ["S"] }));
    expect(sede.prendas.find((p) => p.productoId === "X")!.estado.tipo).toBe("dudosa");
  });
});

describe("analizarSede: la rapidez y los cortes de la categoría", () => {
  it("la rapidez usa las unidades de la MISMA ventana que la vara: vara a 30 días y prenda colgada hace 100 → «sin dato», no «lenta»", () => {
    // PENDIENTE DE FELIPE: que «colgada 100 días sin vender en una categoría que rota en días» diga «revisa sus ventas» y
    // no «por decidir». Hoy lo decide la ventana de la vara: en 30 días su edad es desconocida.
    const vara = varaDeBlusas(92);
    const x = talla("X1", "X", { primeraExhibicion: ts(20), pisoHoy: 2 });
    const { sede } = analizarSede(lectura([...vara.tallas, x], { ...vara.eventos, X1: [bajada(20, 2)] }));
    expect(sede.categorias[0].ventanaDias).toBe(30);
    const p = sede.prendas.find((q) => q.productoId === "X")!;
    expect(p.rapidez).toBeNull();
    expect(p.estado.quieta).toBe(false);
  });

  it("la única prenda de su categoría, Crítica: no es «pilar» por compararse contra sí misma; sin dato → «revisa sus ventas»", () => {
    // «Vestidos» con un solo modelo: 30 colgados el día 1, 28 vendidos (uno cada 2,5 días), 2 siguen colgados.
    const vestido = talla("V", "vestido", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(1), pisoHoy: 2 });
    const eventos = { V: [bajada(1, 30), ...Array.from({ length: 28 }, (_, i) => venta(1 + 2.5 * (i + 1), 1))] };
    const { sede } = analizarSede(lectura([vestido], eventos));
    expect(sede.categorias[0]).toMatchObject({ nivel: "solido", vendidas: 28 });
    const p = sede.prendas[0];
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica" });
    expect(p.rapidez).toBeNull();
    expect(p.estado.sugerencias).toEqual(["revisar_ventas"]);
  });

  it("una categoría que no vendió ni la mitad (sin P50) no tiene «Nuevas»: «aún sin referencia», aunque su nivel sea «Sólido»", () => {
    // «Casacas»: 4 modelos de 25 colgados el día 60 que vendieron 7 cada uno, y uno de 10 que no vendió nada.
    const tallas: TallaFrescuraCruda[] = [];
    const eventos: Record<string, EventoPiso[]> = {};
    for (let m = 1; m <= 4; m++) {
      tallas.push(talla(`CAS-${m}`, `casaca-${m}`, { categoriaId: "casacas", categoriaNombre: "Casacas", primeraExhibicion: ts(60), pisoHoy: 18 }));
      eventos[`CAS-${m}`] = [bajada(60, 25), ...Array.from({ length: 7 }, (_, i) => venta(60 + ((i + 1) * 7 * m) / 4, 1))];
    }
    tallas.push(talla("CAS-CERO", "casaca-cero", { categoriaId: "casacas", categoriaNombre: "Casacas", primeraExhibicion: ts(60), pisoHoy: 10 }));
    eventos["CAS-CERO"] = [bajada(60, 10)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    const cat = sede.categorias[0];
    expect(cat).toMatchObject({ nivel: "solido", vendidas: 28, cortes: { p50: null, p75: null, p90: null } });
    expect(cat.vendidoAlFinal).toBeCloseTo(28 / 110, 9);
    expect(sede.prendas.map((p) => p.estado.tipo)).toEqual(Array(5).fill("sin_vara"));
    expect(sede.cifras.pctNuevas).toBeNull();
  });
});

describe("analizarSede: casos de la revisión 4 (con las historias que el revisor corrió contra la salida real de la base)", () => {
  const cat = (id: string, nombre: string) => ({ categoriaId: id, categoriaNombre: nombre });

  it("las gemelas K y U: misma historia física, U vino en la carga inicial. U nunca queda quieta ni recibe «Trasladar»: sus ventas salieron de la carga", () => {
    // Vestidos: 10 modelos × 3 colgados hace 100 días, vendidos a los 10, 30 y 50 días. K y U: 10 colgadas hace 60 días,
    // 1 vendida cada 6 días (10 ventas) y 4 bajadas del almacén hace 25 días (1 queda en el almacén). Solo cambia la marca
    // de la primera bajada (U: edad desconocida). El FIFO le da las 10 ventas de U a las 10 de la carga: sus 4 repuestas
    // (edad conocida) parecen sin vender. Antes: U rapidez 0, «lenta», quieta, [cambiar_lugar, trasladar].
    const tallas: TallaFrescuraCruda[] = [];
    const eventos: Record<string, EventoPiso[]> = {};
    for (let i = 1; i <= 10; i++) {
      const v = `VARAV-${i}`;
      tallas.push(talla(v, `vestido-${i}`, { ...cat("vestidos", "Vestidos"), primeraExhibicion: ts(20, i) }));
      eventos[v] = [bajada(20, 3, {}, i), venta(30, 1, i), venta(50, 1, i), venta(70, 1, i)];
    }
    const historia = (primera: Partial<EventoPiso>) => [
      bajada(60, 10, primera),
      ...[0, 1, 2, 3, 4, 5].map((k) => venta(63 + 6 * k, 1)),
      bajada(95, 4),
      ...[6, 7, 8, 9].map((k) => venta(63 + 6 * k, 1)),
    ];
    for (const [id, primera] of [
      ["K", {}],
      ["U", { edadDesconocida: true }],
    ] as const) {
      tallas.push(talla(id, id, { ...cat("vestidos", "Vestidos"), primeraExhibicion: ts(60), pisoHoy: 4, almacenHoy: 1 }));
      eventos[id] = historia(primera);
    }
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(sede.categorias[0]).toMatchObject({ nivel: "solido", cortes: { p50: 30 * D, p75: 50 * D, p90: 50 * D } });
    const k = sede.prendas.find((p) => p.productoId === "K")!;
    const u = sede.prendas.find((p) => p.productoId === "U")!;
    expect(k.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", alMenos: false, quieta: false, sugerencias: [] });
    expect(k.rapidez?.indice).toBeGreaterThanOrEqual(100); // un pilar
    expect(u.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", alMenos: true, quieta: false, sugerencias: ["revisar_ventas"] });
    expect(u.rapidez).toBeNull();
  });

  it("la falda que es casi toda su categoría: vara «Sólido» hecha de sus propias ventas, 2 del resto → no recibe «Trasladar»", () => {
    // Faldas: X, 30 colgadas hace 80 días (2 más en el almacén), 28 vendidas, una cada 2,5 días. Y, el único otro
    // modelo: 2 colgadas y vendidas a los 1 y 2 días. La vara: 30 ventas («Sólido»), 28 de X. Antes: [cambiar_lugar, trasladar].
    const x = talla("X", "falda-x", { ...cat("faldas", "Faldas"), primeraExhibicion: ts(40), pisoHoy: 2, almacenHoy: 2 });
    const y = talla("Y", "falda-y", { ...cat("faldas", "Faldas"), primeraExhibicion: ts(40, 1) });
    const { sede } = analizarSede(
      lectura([x, y], {
        X: [bajada(40, 30), ...Array.from({ length: 28 }, (_, g) => ev(40 + 2.5 * (g + 1), -1, { esVenta: true }))],
        Y: [bajada(40, 2, {}, 1), venta(41, 1), venta(42, 1)],
      }),
    );
    expect(sede.categorias[0]).toMatchObject({ nivel: "solido", vendidas: 30 });
    const p = sede.prendas.find((q) => q.productoId === "falda-x")!;
    expect(p.rapidez).toMatchObject({ indice: 62, referencia: 2 });
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true, sugerencias: ["cambiar_lugar"] });
  });

  /** Pantalones: 10 modelos × 2 colgados hace 45 días; 10 vendidas a los 10 días y 6 a los 30. P50 = 10, P75 = 30, sin P90. */
  const pantalones = () => {
    const tallas: TallaFrescuraCruda[] = [];
    const eventos: Record<string, EventoPiso[]> = {};
    for (let i = 1; i <= 10; i++) {
      const v = `VARAP-${i}`;
      tallas.push(talla(v, `pantalon-${i}`, { ...cat("pantalones", "Pantalones"), primeraExhibicion: ts(75) }));
      eventos[v] = [bajada(75, 2), venta(85, 1), ...(i <= 6 ? [venta(105, 1)] : [])];
    }
    return { tallas, eventos };
  };

  it("el pantalón de la carga inicial, 70 días sin vender, pasó el P75 y todo lo que la curva vio: «al menos Envejecida» y «revisa sus ventas» (antes, «aún sin referencia» y nada)", () => {
    const { tallas, eventos } = pantalones();
    tallas.push(talla("Z", "carga-70d", { ...cat("pantalones", "Pantalones"), primeraExhibicion: ts(50), pisoHoy: 3 }));
    eventos.Z = [bajada(50, 3, { edadDesconocida: true })];
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(sede.categorias[0]).toMatchObject({ cortes: { p50: 10 * D, p75: 30 * D, p90: null }, tMax: 45 * D });
    const z = sede.prendas.find((p) => p.productoId === "carga-70d")!;
    expect(z.estado).toMatchObject({ tipo: "semaforo", tramo: "envejecida", alMenos: true, quieta: false, sugerencias: ["revisar_ventas"] });
  });

  it("PENDIENTE DE FELIPE: el pantalón de 70 días con edad conocida y 0 de 3 vendidas sale Vigente, porque sus propias unidades sostienen la curva", () => {
    // Con Z2 en la curva, sus 3 unidades sin vender llevan el P50 de 10 a 30 días, borran el P75 y ponen tMax en 70: queda
    // «Vigente» con rapidez 0 y no entra en «Por decidir». Sin ella, la categoría dice P50 = 10 y P75 = 30 (sería «al
    // menos Envejecida» y, lenta, «por decidir»). Medir el tramo contra la categoría SIN la prenda (como ya se mide la
    // rapidez) lo decide Felipe: ADR-0208, «Revisión 4 del paso 3». Si decide que sí, esta prueba cambia.
    const { tallas, eventos } = pantalones();
    tallas.push(talla("Z2", "lote-70d", { ...cat("pantalones", "Pantalones"), primeraExhibicion: ts(50), pisoHoy: 3 }));
    eventos.Z2 = [bajada(50, 3)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(sede.categorias[0]).toMatchObject({ cortes: { p50: 30 * D, p75: null, p90: null }, tMax: 70 * D });
    const z2 = sede.prendas.find((p) => p.productoId === "lote-70d")!;
    expect(z2.rapidez?.indice).toBe(0);
    expect(z2.estado).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: false, quieta: false, sugerencias: [] });
  });

  it("la prenda más vieja de una categoría sin P75 (su reloj ES la observación más larga) sale Vigente, no «aún sin referencia», con horas reales con milisegundos", () => {
    // 3 colgadas, 2 vendidas: el reloj sumado por tramos daba 345223.80700000003 contra un tMax de 345223.807.
    const e: EventoPiso[] = [
      { ts: "2026-06-25T19:26:15.951Z", delta: 3, esVenta: false, esMovimientoInterno: true },
      { ts: "2026-06-28T15:44:48.420Z", delta: -1, esVenta: true, esMovimientoInterno: false },
      { ts: "2026-06-29T06:08:26.374Z", delta: -1, esVenta: true, esMovimientoInterno: false },
    ];
    const ahora = "2026-06-29T19:19:59.758Z";
    const desde = new Date(Date.parse(ahora) - 120 * D * 1000).toISOString();
    const { sede } = analizarSede(lectura([talla("A", "a", { primeraExhibicion: e[0].ts, pisoHoy: 1 })], { A: e }, { desde, ahora }));
    expect(sede.categorias[0].cortes).toMatchObject({ p75: null });
    expect(sede.categorias[0].cortes.p50).not.toBeNull();
    expect(sede.prendas[0].estado).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: false });
  });
});

describe("referenciaCayla: una curva con las unidades de las 3 sedes juntas", () => {
  const sede = (n: number): ObservacionesSede => ({
    blusas: { nombre: "Blusas", unidadesEn: () => todasVendidas(n) },
  });

  it("dos sedes con 10 ventas cada una son «Aceptable» cada una y «Sólido» juntas", () => {
    const [ref] = referenciaCayla([sede(10), sede(10)]);
    expect(ref).toMatchObject({ categoriaId: "blusas", categoriaNombre: "Blusas", ventanaDias: 30, vendidas: 20, nivel: "solido" });
    expect(referenciaCayla([sede(10)])[0].nivel).toBe("aceptable");
  });

  it("no es el promedio de los P50: la sede con más ventas pesa más", () => {
    const soloA120 = (obs: Observacion[]) => (d: number) => (d === 120 ? obs : []);
    const rapida: ObservacionesSede = { blusas: { nombre: "Blusas", unidadesEn: soloA120(Array.from({ length: 30 }, () => vendida(2))) } };
    const lenta: ObservacionesSede = { blusas: { nombre: "Blusas", unidadesEn: soloA120([vendida(40), vendida(40)]) } };
    expect(referenciaCayla([rapida, lenta])[0].cortes.p50).toBe(2 * D);
  });
});

describe("clavePrendaDe (la misma prenda en Análisis y en Frescura)", () => {
  it("manda el código del color; sin código, el nombre; sin los dos, el modelo solo", () => {
    expect(clavePrendaDe("p1", "NEG", "Negro")).toBe("p1|NEG");
    expect(clavePrendaDe("p1", null, "Negro")).toBe("p1|Negro");
    expect(clavePrendaDe("p1", null, null)).toBe("p1|");
  });
});
