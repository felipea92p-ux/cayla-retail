import { describe, expect, it } from "vitest";
import { compararInstantes, historiaDeCohortes, type EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import {
  analizarSede,
  construirVara,
  contraElResto,
  cortes,
  elegirVentana,
  estadoFrescura,
  estaQuieta,
  eventosConApartados,
  excluirTardias,
  inicioDeSusUltimosDias,
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
  vendidasDe,
  type Curva,
  type EntradaEstado,
  type LecturaFrescuraConPiso,
  type NivelConfianza,
  type Observacion,
  type ObservacionesSede,
  type PuntoApartado,
  type Rapidez,
  type Sugerencia,
  type TallaFrescuraCruda,
  type TardiaCruda,
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

  it("sus observaciones NO vienen ordenadas: primero las salidas y después lo colgado (por eso contraElResto ordena, revisión 4)", () => {
    expect(observacionesDe([bajada(0, 1), venta(30, 1), bajada(110, 1)], ts(120)).map((o) => o.segundos / D)).toEqual([30, 10]);
  });

  it("cuenta aparte las ventas que salieron de lo que tiene edad desconocida (el FIFO vende primero lo de la carga), con su hora, y cuándo se colgó lo primero con edad conocida", () => {
    // 3 de la carga inicial, 2 bajadas después con edad conocida; se venden 3: las 3 salen de la carga.
    const u = unidadesParaVara([bajada(0, 3, { edadDesconocida: true }), bajada(10, 2), venta(12, 1), venta(14, 1), venta(16, 1)], ts(20));
    expect(u).toEqual({
      observaciones: [{ segundos: 10 * D, vendida: false, peso: 2 }],
      ventasSinEdad: [12, 14, 16].map((d) => ({ ts: ts(d), cantidad: 1 })),
      primeraConEdad: Date.parse(ts(10)),
    });
    // Una pérdida de lo desconocido no es una venta; sin nada con edad conocida, no hay «primera».
    expect(unidadesParaVara([bajada(0, 2, { edadDesconocida: true }), ev(3, -1)], ts(5))).toMatchObject({ ventasSinEdad: [], primeraConEdad: null });
    // Lo primero con edad conocida cuenta aunque ya se haya vendido entero (el día 1, no el 8).
    expect(unidadesParaVara([bajada(1, 1), venta(2, 1), bajada(8, 1)], ts(10)).primeraConEdad).toBe(Date.parse(ts(1)));
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
  ventasRecientes: null,
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

/** El riesgo acumulado de una curva a `segundos`, leído a mano (lo que cada unidad espera). */
const riesgoEn = (curva: Curva, segundos: number) => {
  let h = 0;
  curva.tiempos.forEach((t, i) => {
    if (t <= segundos) h = curva.riesgoAcumulado[i];
  });
  return h;
};
/** La rapidez de `suyas` contra `curva` SIN `propias`, por el camino de la pantalla: contraElResto + rapidez. */
const rapidezContra = (curva: Curva, propias: readonly Observacion[], suyas: readonly Observacion[] = propias, sinEdad = 0) => {
  const m = contraElResto(curva, propias, suyas);
  return rapidez(vendidasDe(suyas), m.esperadas, m.vendidas, sinEdad);
};

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
    expect(rapidezContra(curva, a)).toEqual({ indice: 500, vendidas: 2, esperadas: 0.4, referencia: 3 });
    expect(rapidezContra(curva, b)).toEqual({ indice: 41, vendidas: 1, esperadas: 2.47, referencia: 4 });
  });

  it("contraElResto da lo mismo que armar la curva sin la prenda (restando instante por instante, sin reordenar): cortes, observación más larga, ventas y el riesgo acumulado en cada instante", () => {
    for (const [propias, resto] of [
      [a, [...b, ...c]],
      [b, [...a, ...c]],
      [c, [...a, ...b]],
    ] as const) {
      const m = contraElResto(curva, propias, []);
      const armada = kaplanMeier(resto);
      // D5: los cortes y la observación más larga del resto (el tramo se mide contra ellos).
      expect(m.cortes).toEqual(cortes(armada));
      expect(m.tMax).toBe(armada.tMax);
      expect(m.vendidas).toBe(armada.vendidas);
      for (let t = 0.5; t <= 7.5; t += 0.5) expect(contraElResto(curva, propias, [colgada(t)]).esperadas).toBeCloseTo(riesgoEn(armada, t * D), 12);
    }
  });

  it("la observación más larga SIN ella (D5): se salta solo lo suyo, aunque comparta el instante con otra unidad", () => {
    // C tiene la observación más larga (6 días): sin C, la más larga es la colgada de B (5 días).
    expect(contraElResto(curva, c, []).tMax).toBe(5 * D);
    // Otra unidad colgada también a los 6 días: sin C, sigue siendo 6.
    const conOtra = kaplanMeier([...a, ...b, ...c, colgada(6)]);
    expect(contraElResto(conOtra, c, []).tMax).toBe(6 * D);
    // Todo es suyo: no queda curva (sin cortes, tMax 0).
    expect(contraElResto(kaplanMeier(c), c, [])).toMatchObject({ tMax: 0, cortes: { p50: null, p75: null, p90: null }, vendidas: 0 });
  });

  it("…también con las unidades propias DESORDENADAS, como las devuelve unidadesParaVara (revisión 4, mutante x20)", () => {
    const d = [vendida(30), colgada(3), vendida(6)];
    const curvaD = kaplanMeier([...a, ...b, ...d]);
    const armada = kaplanMeier([...a, ...b]);
    expect(contraElResto(curvaD, d, []).cortes).toEqual(cortes(armada));
    expect(contraElResto(curvaD, d, d).esperadas).toBeCloseTo(d.reduce((s, o) => s + o.peso * riesgoEn(armada, o.segundos), 0), 12);
    expect(rapidezContra(curvaD, d)).toEqual(rapidezContra(armada, [], d));
  });

  it("en 400 categorías al azar (empates, pesos, unidades sin vender en el instante de una venta): contraElResto ≡ kaplanMeier del resto, en cortes, observación más larga, ventas y lo esperado en cada unidad", () => {
    let semilla = 20260927;
    const azar = (n: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return Math.floor((semilla / 2147483648) * n);
    };
    // Instantes de un conjunto chico para que haya empates entre la prenda y el resto (el caso delicado de la resta).
    const unidad = (): Observacion => ({ segundos: (1 + azar(12)) * D, vendida: azar(3) > 0, peso: 1 + azar(3) });
    let conCortes = 0;
    for (let n = 0; n < 400; n++) {
      const resto = Array.from({ length: 1 + azar(15) }, unidad);
      const propias = Array.from({ length: azar(8) }, unidad);
      const suyas = [...propias, ...Array.from({ length: azar(4) }, unidad)];
      const curva = kaplanMeier([...resto, ...propias]);
      const armada = kaplanMeier(resto);
      const m = contraElResto(curva, propias, suyas);
      expect(m.cortes).toEqual(cortes(armada));
      expect(m.tMax).toBe(armada.tMax);
      expect(m.vendidas).toBeCloseTo(armada.vendidas, 9);
      const esperadas = suyas.reduce((s, o) => s + o.peso * riesgoEn(armada, o.segundos), 0);
      expect(m.esperadas).toBeCloseTo(esperadas, 9);
      // Unidad por unidad, también en los instantes intermedios (medio día antes y después de cada instante posible).
      for (let t = 0.5; t <= 13; t += 0.5) expect(contraElResto(curva, propias, [colgada(t)]).esperadas).toBeCloseTo(riesgoEn(armada, t * D), 9);
      expect(rapidez(vendidasDe(suyas), m.esperadas, m.vendidas)).toEqual(rapidez(vendidasDe(suyas), esperadas, armada.vendidas));
      // Y la vara sin nada que restar es la misma curva.
      expect(contraElResto(armada, [], suyas).cortes).toEqual(cortes(armada));
      if (m.cortes.p50 !== null) conCortes++;
    }
    expect(conCortes).toBeGreaterThan(100);
  });

  it("con ventas de lo sin edad que pudieron esconder las suyas (R7-3): se mide sin contarlas y contándolas como suyas; vale si las dos dicen lo mismo, si no, sin dato", () => {
    // 4 colgadas 25 días contra la categoría entera: esperadas 4 × H(4 días) = 4 × (2/7 + 1/5 + 1/4 + 1/3) = 4,28.
    expect(rapidezContra(curva, [], [colgada(25, 4)])).toMatchObject({ indice: 0, esperadas: 4.28 });
    // 1 escondida: aun contada como suya son 23 contra 100 (1 ÷ 4,28). Lenta de las dos maneras (antes: sin dato).
    expect(rapidezContra(curva, [], [colgada(25, 4)], 1)).toMatchObject({ indice: 0, vendidas: 0 });
    // 4 escondidas: 94, todavía lenta; 5: 117, sería pilar si eran suyas. No se sabe cuál: sin dato.
    expect(rapidezContra(curva, [], [colgada(25, 4)], 4)).toMatchObject({ indice: 0 });
    expect(rapidezContra(curva, [], [colgada(25, 4)], 5)).toBeNull();
    // Un pilar sigue pilar: contar más ventas nunca le baja el índice (y vale lo que se sabe, sin las escondidas).
    expect(rapidezContra(curva, a, a, 3)).toEqual({ indice: 500, vendidas: 2, esperadas: 0.4, referencia: 3 });
    // Sin evidencia sigue sin dato, aunque contando las escondidas alcanzara.
    expect(rapidez(0, 0.5, 20, 1)).toBeNull();
    // El borde es el mismo 100 de `esPilar` en las DOS cuentas (verificación de la revisión 7): 100 exacto ya es pilar,
    // así que 4 de 4 esperadas sigue pilar con una escondida, y 3 de 4 (75) que llega a 100 contándola cambia de veredicto.
    expect(rapidez(4, 4, 30, 1)).toEqual({ indice: 100, vendidas: 4, esperadas: 4, referencia: 30 });
    expect(rapidez(3, 4, 30, 1)).toBeNull();
  });

  it("la única prenda de su categoría no se compara contra sí misma: sin dato, nunca «pilar» (con ella adentro daba 100 exacto)", () => {
    const sola = [vendida(3), vendida(7), colgada(20, 2)];
    expect(rapidezContra(kaplanMeier(sola), [], sola)?.indice).toBe(100); // la identidad que escondía todo
    expect(rapidezContra(kaplanMeier(sola), sola)).toBeNull();
  });

  it("recién colgada y sin ventas no es «lenta»: es «sin dato»", () => {
    expect(rapidezContra(curva, [], [colgada(0.5)])).toBeNull();
    expect(rapidezContra(kaplanMeier([...a, ...b]), [], [colgada(1.5)])).toBeNull(); // esperaba 0,25: poca evidencia
    expect(rapidezContra(curva, [], [])).toBeNull();
  });
});

/** Una rapidez medida contra `referencia` ventas del resto de su categoría (20: «Sólido»). */
const r = (indice: number, referencia = 20): Rapidez => ({ indice, vendidas: 1, esperadas: 1, referencia });

describe("estaQuieta: vieja Y lenta, o temporada pasada; un pilar nunca por vieja", () => {
  it("un pilar de venta no está quieto por viejo, aunque sea Crítica; por su temporada pasada SÍ (D2, Felipe 2026-09-27)", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: r(150), recientes: "vendio", pisoHoy: 4 })).toBe(false);
    expect(estaQuieta({ tramo: "envejecida", temporadaPasada: false, rapidez: r(100), recientes: "no_se_sabe", pisoHoy: 4 })).toBe(false);
    // Antes: false (un pilar nunca iba a «Por decidir»), y el bikini que se sigue vendiendo después del 20 de marzo no
    // aparecía para que el líder decida.
    expect(estaQuieta({ tramo: "critica", temporadaPasada: true, rapidez: r(150), recientes: "vendio", pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "nueva", temporadaPasada: true, rapidez: r(100), recientes: "vendio", pisoHoy: 4 })).toBe(true);
  });

  it("el que dejó de venderse (30 días colgado sin vender) no es pilar aunque su índice pase de 100: vieja, es quieta (revisión 6)", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: r(150), recientes: "dejo_de_vender", pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "vigente", temporadaPasada: false, rapidez: r(150), recientes: "dejo_de_vender", pisoHoy: 4 })).toBe(false);
  });

  it("Envejecida o Crítica y más lenta que su categoría: quieta; Vigente o Nueva, no", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: r(60), recientes: "vendio", pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "envejecida", temporadaPasada: false, rapidez: r(99), recientes: "no_se_sabe", pisoHoy: 4 })).toBe(true);
    expect(estaQuieta({ tramo: "vigente", temporadaPasada: false, rapidez: r(20), recientes: "dejo_de_vender", pisoHoy: 4 })).toBe(false);
  });

  it("sin dato de rapidez no es «lenta» (el éxito de la carga inicial no va al perchero); la temporada pasada sí cuenta", () => {
    for (const recientes of ["vendio", "dejo_de_vender", "no_se_sabe"] as const) {
      expect(estaQuieta({ tramo: "critica", temporadaPasada: false, rapidez: null, recientes, pisoHoy: 4 })).toBe(false);
      expect(estaQuieta({ tramo: null, temporadaPasada: true, rapidez: null, recientes, pisoHoy: 4 })).toBe(true);
    }
  });

  it("sin nada en el piso no hay nada quieto en el piso", () => {
    expect(estaQuieta({ tramo: "critica", temporadaPasada: true, rapidez: r(10), recientes: "dejo_de_vender", pisoHoy: 0 })).toBe(false);
  });

  it("sin dato de rapidez, una prenda vieja sugiere «revisa sus ventas», nunca «Trasladar»", () => {
    const e = estadoFrescura(entrada({ reloj: { segundos: 30 * D, alMenos: false }, rapidez: null, almacenHoy: 5 }));
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: false, sugerencias: ["revisar_ventas"] });
  });
});

describe("«Trasladar» solo con «Sólido» (en la vara Y en la referencia que midió su rapidez) y algo en el almacén", () => {
  const PERMITIDAS: readonly Sugerencia[] = ["revisar_ventas", "cambiar_lugar", "trasladar", "retirar", "sigue_vendiendo", "guardar_hasta_su_estacion"];

  it("en ninguna combinación aparece sin «Sólido», sin almacén o sin dato de rapidez; y «Rebajar» no existe", () => {
    let vistas = 0;
    let pilaresPasados = 0;
    let sinDatoPasados = 0;
    for (const nivel of [null, "pocos_datos", "aceptable", "solido"] as const)
      for (const almacenHoy of [0, 3])
        for (const rap of [null, r(40), r(150), r(40, 19), r(40, 2)])
          for (const tramo of [null, "nueva", "vigente", "envejecida", "critica"] as const)
            for (const temporadaPasada of [false, true])
              for (const pisoHoy of [0, 2])
                for (const recientes of ["vendio", "dejo_de_vender", "no_se_sabe"] as const)
                  for (const callada of [false, true]) {
                    // «Callada» es, entre otras cosas, 30 días colgada sin vender.
                    if (callada && recientes !== "dejo_de_vender") continue;
                    const quieta = estaQuieta({ tramo, temporadaPasada, rapidez: rap, recientes, pisoHoy });
                    const s = sugerenciasDe({ quieta, tramo, temporadaPasada, fueraDeSuEstacion: false, rapidez: rap, recientes, nivel, pisoHoy, almacenHoy, callada });
                    for (const x of s) expect(PERMITIDAS).toContain(x);
                    if (s.includes("trasladar")) {
                      vistas++;
                      expect(nivel).toBe("solido");
                      expect(almacenHoy).toBeGreaterThan(0);
                      expect(rap).not.toBeNull();
                      expect(rap!.referencia).toBeGreaterThanOrEqual(20);
                    }
                    // Un pilar: índice 100 o más y no dejó de venderse (revisión 6).
                    const pilar = rap !== null && rap.indice >= 100 && recientes !== "dejo_de_vender";
                    // Sin dato de rapidez y vendió en sus últimos 30 días en el piso (pregunta 8, Felipe 2026-09-28).
                    const sinDatoQueVende = rap === null && recientes === "vendio";
                    // D2: lo que se sigue vendiendo, de temporada pasada y con algo en el piso, está «por decidir» y recibe
                    // SOLO su pregunta: nunca «trasladar».
                    if (temporadaPasada && pisoHoy > 0 && (pilar || sinDatoQueVende)) {
                      if (pilar) pilaresPasados++;
                      else sinDatoPasados++;
                      expect(quieta).toBe(true);
                      expect(s).toEqual(["sigue_vendiendo"]);
                    } else expect(s).not.toContain("sigue_vendiendo");
                    // Con dato de rapidez, vieja y en el piso: pilar o quieta, nunca las dos ni ninguna (revisión 6).
                    if (rap !== null && pisoHoy > 0 && (tramo === "envejecida" || tramo === "critica")) expect(quieta).toBe(!pilar || temporadaPasada);
                    // D4+D6: callada siempre trae una pista.
                    if (callada && !(temporadaPasada && pisoHoy > 0 && pilar)) expect(s).toContain("revisar_ventas");
                  }
    expect(vistas).toBeGreaterThan(0);
    expect(pilaresPasados).toBeGreaterThan(0);
    expect(sinDatoPasados).toBeGreaterThan(0);
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

  it("el bikini que se sigue vendiendo bien después del 20 de marzo (un pilar de temporada pasada): «Por decidir» con «sigue vendiendo», nunca «trasladar» (D2, Felipe 2026-09-27)", () => {
    // Vara «Sólido», 3 en el almacén y 20 ventas del resto: todo lo que «trasladar» pide. Igual no se sugiere: se vende.
    const e = estadoFrescura(entrada({ finEstacion: ts(90), reloj: { segundos: 12 * D, alMenos: false }, rapidez: r(180), almacenHoy: 3 }));
    // Antes: quieta false y ["retirar"] (una orden donde hay una decisión, y fuera de «Por decidir»).
    expect(e).toMatchObject({ tipo: "semaforo", tramo: "envejecida", temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] });
    // El que no es pilar sigue con su escalera y «retirar».
    expect(estadoFrescura(entrada({ finEstacion: ts(90), reloj: { segundos: 12 * D, alMenos: false }, rapidez: r(40), almacenHoy: 3 })).sugerencias).toEqual([
      "cambiar_lugar",
      "trasladar",
      "retirar",
    ]);
    // Sin nada en el piso no hay nada que decidir del piso.
    expect(estadoFrescura(entrada({ finEstacion: ts(90), rapidez: r(180), pisoHoy: 0 }))).toMatchObject({ quieta: false, sugerencias: [] });
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

describe("«revisa sus ventas» para la prenda callada sin tramo firme (D4+D6, 2026-09-27): nunca una prenda quieta sin pista", () => {
  const sinP75 = { ...VARA_5_10_20, cortes: { p50: 5 * D, p75: null, p90: null } };
  const lenta = { ...VARA_5_10_20, cortes: { p50: 50 * D, p75: 60 * D, p90: 70 * D } };
  const callada = { reloj: { segundos: 70 * D, alMenos: false }, ventasRecientes: 0 };

  it("«al menos Vigente» sin dato de rapidez, 70 días colgada y nada vendido en 30: «revisa sus ventas» (D6; antes, ninguna sugerencia)", () => {
    expect(estadoFrescura(entrada({ ...callada, vara: sinP75 }))).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: true, sugerencias: ["revisar_ventas"] });
    // Con dato de rapidez también: no ser «vieja» no la deja sin pista.
    expect(estadoFrescura(entrada({ ...callada, vara: sinP75, rapidez: r(0) })).sugerencias).toEqual(["revisar_ventas"]);
  });

  it("sin tramo (categoría sin P50), sin ventas en la sede o sin edad conocida: también (D4)", () => {
    expect(estadoFrescura(entrada({ ...callada, vara: { ...VARA_5_10_20, cortes: { p50: null, p75: null, p90: null } } }))).toMatchObject({
      tipo: "sin_vara",
      sugerencias: ["revisar_ventas"],
    });
    expect(estadoFrescura(entrada({ ...callada, vara: { ...VARA_5_10_20, nivel: null } }))).toMatchObject({ tipo: "sin_ventas_sede", sugerencias: ["revisar_ventas"] });
    expect(estadoFrescura(entrada({ reloj: { segundos: 40 * D, alMenos: true }, ventasRecientes: 0, vara: lenta }))).toMatchObject({
      tipo: "sin_edad_conocida",
      sugerencias: ["revisar_ventas"],
    });
  });

  it("no la recibe si vendió algo en los últimos 30 días, si lleva menos de 30 colgada, si no está en el piso, si la lectura no cubre 30 días o si su tramo es firme", () => {
    const vacia = (o: Partial<EntradaEstado>) => estadoFrescura(entrada({ ...callada, vara: sinP75, ...o })).sugerencias;
    expect(vacia({ ventasRecientes: 1 })).toEqual([]);
    expect(vacia({ ventasRecientes: null })).toEqual([]);
    expect(vacia({ reloj: { segundos: 29 * D, alMenos: true }, vara: { ...VARA_5_10_20, cortes: { p50: null, p75: null, p90: null } } })).toEqual([]);
    expect(vacia({ pisoHoy: 0 })).toEqual([]);
    // Vigente exacto (con P75 que la curva alcanza): el tramo ya es la pista.
    expect(estadoFrescura(entrada({ reloj: { segundos: 55 * D, alMenos: false }, ventasRecientes: 0, vara: lenta }))).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: false, sugerencias: [] });
    // El clásico y la dudosa tienen su propio estado.
    expect(estadoFrescura(entrada({ ...callada, esClasico: true, temporada: "clasico_todo_el_anio" })).sugerencias).toEqual([]);
    expect(estadoFrescura(entrada({ ...callada, dudosa: true })).sugerencias).toEqual([]);
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
  ultimaLlegadaCayla: null,
  pisoHoy: 0,
  almacenHoy: 0,
  apartadasHoy: 0,
  ...o,
  // Lo apartado de estas pruebas es del piso, salvo que se diga otra cosa (paso 4: `apartadas_piso_hoy`).
  apartadasPisoHoy: o.apartadasPisoHoy ?? o.apartadasHoy ?? 0,
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
  it("colgada 100 días sin vender en una categoría que rota en días (vara de 30): lenta, Crítica y «Por decidir» (D3; antes «sin dato» y fuera de «Por decidir»)", () => {
    // La vara es de 30 días; la prenda se colgó hace 100. Su rapidez se mide con sus unidades de TODA la lectura (A1): 2
    // colgadas 100 días y ninguna vendida contra una categoría que vende en 1 a 5 días. Antes, recortada a la ventana de
    // la vara, su edad era «desconocida» y la rapidez «sin dato»: quedaba en «revisa sus ventas».
    const vara = varaDeBlusas(92);
    const x = talla("X1", "X", { primeraExhibicion: ts(20), pisoHoy: 2 });
    const { sede } = analizarSede(lectura([...vara.tallas, x], { ...vara.eventos, X1: [bajada(20, 2)] }));
    expect(sede.categorias[0].ventanaDias).toBe(30);
    const p = sede.prendas.find((q) => q.productoId === "X")!;
    expect(p.rapidez).toMatchObject({ indice: 0, vendidas: 0, referencia: 25 });
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", alMenos: false, quieta: true, sugerencias: ["cambiar_lugar"] });
    expect(sede.cifras.porDecidir).toBe(1);
  });

  it("la única prenda de su categoría: sin ella no queda contra qué medirla, ni tramo ni rapidez (D5); callada 30 días → «revisa sus ventas»", () => {
    // «Vestidos» con un solo modelo: 30 colgados el día 1, 28 vendidos (uno cada 2,5 días, el último el día 71), 2 siguen
    // colgados. Antes (con ella en su propia curva) salía Crítica contra cortes que ella misma ponía.
    const vestido = talla("V", "vestido", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(1), pisoHoy: 2 });
    const eventos = { V: [bajada(1, 30), ...Array.from({ length: 28 }, (_, i) => venta(1 + 2.5 * (i + 1), 1))] };
    const { sede } = analizarSede(lectura([vestido], eventos));
    // La cabecera de la categoría sigue siendo la curva completa.
    expect(sede.categorias[0]).toMatchObject({ nivel: "solido", vendidas: 28 });
    expect(sede.categorias[0].cortes.p50).not.toBeNull();
    const p = sede.prendas[0];
    expect(p.categoriaSinElla).toEqual({ cortes: { p50: null, p75: null, p90: null }, tMax: 0, vendidas: 0 });
    expect(p.estado).toMatchObject({ tipo: "sin_vara", quieta: false });
    expect(p.rapidez).toBeNull();
    expect(p.ventasRecientes).toBe(0);
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

  it("el pantalón de 70 días con edad conocida y 0 de 3 vendidas: contra su categoría SIN él es «al menos Envejecida» y, lento, «Por decidir» (D5, 2026-09-27; antes Vigente)", () => {
    // Con Z2 en la curva, sus 3 unidades sin vender llevan el P50 de 10 a 30 días, borran el P75 y ponen tMax en 70: salía
    // «Vigente» con rapidez 0 y fuera de «Por decidir». Sin él, su categoría dice P50 = 10, P75 = 30 y tMax = 45: pasó el
    // P75 y todo lo que la curva vio. La cabecera de la categoría sigue mostrando la curva completa (con él).
    const { tallas, eventos } = pantalones();
    tallas.push(talla("Z2", "lote-70d", { ...cat("pantalones", "Pantalones"), primeraExhibicion: ts(50), pisoHoy: 3 }));
    eventos.Z2 = [bajada(50, 3)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(sede.categorias[0]).toMatchObject({ cortes: { p50: 30 * D, p75: null, p90: null }, tMax: 70 * D });
    const z2 = sede.prendas.find((p) => p.productoId === "lote-70d")!;
    expect(z2.categoriaSinElla).toEqual({ cortes: { p50: 10 * D, p75: 30 * D, p90: null }, tMax: 45 * D, vendidas: 16 });
    expect(z2.rapidez?.indice).toBe(0);
    // Lento y vieja: «cambiar de lugar». Sin venta en 30 días y con un tramo que es solo un piso: también «revisa sus
    // ventas» (D4+D6). Sin «trasladar»: la vara es «Aceptable» (16 ventas) y no hay nada en el almacén.
    expect(z2.estado).toMatchObject({ tipo: "semaforo", tramo: "envejecida", alMenos: true, quieta: true, sugerencias: ["revisar_ventas", "cambiar_lugar"] });
    expect(sede.cifras.porDecidir).toBe(1);
  });

  it("dos prendas con la misma historia en una categoría sin P75: cada una, medida contra la otra, sale Vigente exacta (su reloj ES la observación más larga del resto), con horas reales con milisegundos", () => {
    // 3 colgadas, 2 vendidas: el reloj sumado por tramos daba 345223.80700000003 contra un tMax de 345223.807. Desde D5 la
    // prenda ya no está en la curva contra la que se mide: su gemela (colgada en el mismo instante) pone el tMax.
    const e: EventoPiso[] = [
      { ts: "2026-06-25T19:26:15.951Z", delta: 3, esVenta: false, esMovimientoInterno: true },
      { ts: "2026-06-28T15:44:48.420Z", delta: -1, esVenta: true, esMovimientoInterno: false },
      { ts: "2026-06-29T06:08:26.374Z", delta: -1, esVenta: true, esMovimientoInterno: false },
    ];
    const ahora = "2026-06-29T19:19:59.758Z";
    const desde = new Date(Date.parse(ahora) - 120 * D * 1000).toISOString();
    const gemelas = [talla("A", "a", { primeraExhibicion: e[0].ts, pisoHoy: 1 }), talla("B", "b", { primeraExhibicion: e[0].ts, pisoHoy: 1 })];
    const { sede } = analizarSede(lectura(gemelas, { A: e, B: e }, { desde, ahora }));
    for (const p of sede.prendas) {
      expect(p.categoriaSinElla?.cortes).toMatchObject({ p75: null });
      expect(p.categoriaSinElla?.cortes.p50).not.toBeNull();
      expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "vigente", alMenos: false });
    }
  });
});

describe("analizarSede: casos de la revisión 5", () => {
  it("la venta de lo que YA colgaba al empezar la ventana de la vara tiene edad conocida: la rapidez la cuenta (A1; antes el recorte la volvía «desconocida» y la rapidez, «sin dato»)", () => {
    // Vara de 30 días. X colgó 4 el día 60 (edad conocida: dentro de la lectura) y vendió 1 el día 100 y 1 el día 110. Al
    // recortar a la ventana de la vara, esas 4 eran un saldo de «edad desconocida» y sus 2 ventas, ventas sin edad.
    const vara = varaDeBlusas(92);
    const x = talla("X1", "X", { primeraExhibicion: ts(60), pisoHoy: 2 });
    const { sede } = analizarSede(lectura([...vara.tallas, x], { ...vara.eventos, X1: [bajada(60, 4), venta(100, 1), venta(110, 1)] }));
    expect(sede.categorias[0].ventanaDias).toBe(30);
    const p = sede.prendas.find((q) => q.productoId === "X")!;
    expect(p.rapidez).not.toBeNull();
    expect(p.rapidez).toMatchObject({ vendidas: 2, referencia: 25 });
    // La vara de la categoría NO cambia: X no entra a la curva de 30 días (su saldo de la ventana sigue sin edad).
    expect(sede.categorias[0]).toMatchObject({ vendidas: 25 });
    // Lo que de verdad no tiene edad (el saldo con que arranca la LECTURA) sigue dejando la rapidez sin dato.
    const y = talla("Y1", "Y", { primeraExhibicion: ts(-10), pisoHoy: 2 });
    const { sede: s2 } = analizarSede(lectura([...vara.tallas, y], { ...vara.eventos, Y1: [bajada(0, 4, { edadDesconocida: true }), venta(100, 1), venta(110, 1)] }));
    expect(s2.prendas.find((q) => q.productoId === "Y")!.rapidez).toBeNull();
  });

  it("E-Y08 · las ventas sin edad de OTRA talla del mismo modelo+color dejan la rapidez sin dato: la talla conocida primero no la vuelve «lenta» ni «Trasladar»", () => {
    // Vestidos: 10 modelos × 3 colgados hace 100 días. Modelo U en dos tallas, en el orden en que las da la base (L antes
    // que S): L, 4 bajadas con edad conocida hace 25 días, ninguna vendida, 1 en el almacén; S, la carga inicial (edad
    // desconocida) hace 60 días, que vendió 10. La prenda es UNA (modelo+color): sus ventas salieron de lo desconocido.
    const tallas: TallaFrescuraCruda[] = [];
    const eventos: Record<string, EventoPiso[]> = {};
    for (let i = 1; i <= 10; i++) {
      const v = `VARAV-${i}`;
      tallas.push(talla(v, `vestido-${i}`, { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(20, i) }));
      eventos[v] = [bajada(20, 3, {}, i), venta(30, 1, i), venta(50, 1, i), venta(70, 1, i)];
    }
    tallas.push(talla("U-L", "U", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "L", primeraExhibicion: ts(60), pisoHoy: 4, almacenHoy: 1 }));
    eventos["U-L"] = [bajada(95, 4)];
    tallas.push(talla("U-S", "U", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "S", primeraExhibicion: ts(60), pisoHoy: 0 }));
    eventos["U-S"] = [bajada(60, 10, { edadDesconocida: true }), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => venta(63 + 5 * k, 1))];
    const { sede } = analizarSede(lectura(tallas, eventos));
    const u = sede.prendas.find((p) => p.productoId === "U")!;
    expect(u.tallas.map((t) => t.talla)).toEqual(["L", "S"]);
    expect(u.rapidez).toBeNull();
    expect(u.estado.quieta).toBe(false);
    expect(u.estado.sugerencias).not.toContain("trasladar");
    expect(u.estado.sugerencias).not.toContain("cambiar_lugar");
  });
});

/**
 * El fondo de «Blusas» de los escenarios de tienda de la revisión 6: 25 modelos × 4 colgados entre los días 92 y 109 y
 * vendidos a los 2, 4, 6 y 10 días. P50 4 días, P75 6 y P90 10; 100 ventas con edad conocida en los últimos 30 días:
 * vara de 30 días, «Sólido», y 100 ventas del resto contra las que se mide cualquier otra prenda (referencia «Sólido»).
 */
function fondoDeBlusas(): { tallas: TallaFrescuraCruda[]; eventos: Record<string, EventoPiso[]> } {
  const tallas: TallaFrescuraCruda[] = [];
  const eventos: Record<string, EventoPiso[]> = {};
  for (let i = 0; i < 25; i++) {
    const d0 = 92 + (i % 18);
    tallas.push(talla(`fondo-${i}`, `fondo-${i}`, { primeraExhibicion: ts(d0), temporada: null, temporadaOrigen: null }));
    eventos[`fondo-${i}`] = [bajada(d0, 4, { oid: `fondo-${i}-b` }), venta(d0 + 2, 1), venta(d0 + 4, 1), venta(d0 + 6, 1), venta(d0 + 10, 1)];
  }
  return { tallas, eventos };
}

describe("analizarSede: casos de la revisión 6", () => {
  const prendaDe = (sede: ReturnType<typeof analizarSede>["sede"], productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;

  it("el éxito con tallas rotas: vendió 14 de 20 en sus 3 primeros días y lleva 112 sin vender. Ya no es pilar: «Por decidir» con su escalera (antes, Crítica sin ninguna sugerencia; con la temporada pasada, «sigue vendiendo»)", () => {
    // S 5, M 10 y L 5 colgadas el día 5 (hace 115 días). En 3 días se venden las 10 M y 4 S; quedan 1 S y 5 L. Su índice
    // de toda la lectura dice «más rápido que su categoría» (14 vendidas contra ~12,5 esperadas), pero no vende desde el
    // día 8: no es un pilar, es lo que sobró de un éxito.
    const rotas = (finEstacion: string | null) => {
      const { tallas, eventos } = fondoDeBlusas();
      const o = { primeraExhibicion: ts(5), finEstacion };
      tallas.push(talla("ROT-S", "rotas", { ...o, talla: "S", pisoHoy: 1 }), talla("ROT-M", "rotas", { ...o, talla: "M" }), talla("ROT-L", "rotas", { ...o, talla: "L", pisoHoy: 5 }));
      eventos["ROT-S"] = [bajada(5, 5), ...[6, 20, 40, 60].map((h) => venta(5, 1, h * 60))];
      eventos["ROT-M"] = [bajada(5, 10), ...[2, 5, 9, 14, 18, 26, 33, 45, 55, 70].map((h) => venta(5, 1, h * 60))];
      eventos["ROT-L"] = [bajada(5, 5)];
      return analizarSede(lectura(tallas, eventos)).sede;
    };
    const sede = rotas(null);
    const p = prendaDe(sede, "rotas");
    expect(p.rapidez?.indice).toBeGreaterThanOrEqual(100);
    expect(p.ventasRecientes).toBe(0);
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", alMenos: false, temporadaPasada: false, quieta: true, sugerencias: ["cambiar_lugar"] });
    expect(sede.cifras.porDecidir).toBe(1);
    // Con la temporada pasada: la escalera normal y «retirar», no «sigue vendiendo» (no se vende hace 112 días).
    expect(prendaDe(rotas(ts(100)), "rotas").estado).toMatchObject({ temporadaPasada: true, quieta: true, sugerencias: ["cambiar_lugar", "retirar"] });
  });

  it("…por el estado: un pilar por su índice que lleva 30 días colgado sin vender deja de ser pilar; si vendió en 30 días, o no se sabe, sigue siéndolo", () => {
    const apagado = { reloj: { segundos: 40 * D, alMenos: false }, rapidez: r(150), ventasRecientes: 0 };
    expect(estadoFrescura(entrada(apagado))).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true, sugerencias: ["cambiar_lugar"] });
    // Con «Sólido» y almacén, es la escalera entera: lo que no se vende sí se puede mover.
    expect(estadoFrescura(entrada({ ...apagado, almacenHoy: 3 })).sugerencias).toEqual(["cambiar_lugar", "trasladar"]);
    expect(estadoFrescura(entrada({ ...apagado, finEstacion: ts(90) })).sugerencias).toEqual(["cambiar_lugar", "retirar"]);
    // Vendió 1 en los últimos 30 días, la lectura no cubre 30 días, o lleva menos de 30 colgado: pilar.
    expect(estadoFrescura(entrada({ ...apagado, ventasRecientes: 1 }))).toMatchObject({ quieta: false, sugerencias: [] });
    expect(estadoFrescura(entrada({ ...apagado, ventasRecientes: null }))).toMatchObject({ quieta: false, sugerencias: [] });
    expect(estadoFrescura(entrada({ ...apagado, reloj: { segundos: 29 * D, alMenos: false } }))).toMatchObject({ tramo: "critica", quieta: false, sugerencias: [] });
    expect(estadoFrescura(entrada({ ...apagado, ventasRecientes: 1, finEstacion: ts(90) })).sugerencias).toEqual(["sigue_vendiendo"]);
  });

  it("DECIDIDO por Felipe (2026-09-28, pregunta 8): los bikinis gemelos de temporada pasada, uno por lote y otro en la carga inicial, con la misma historia física, reciben los dos «sigue vendiendo» (antes, el de la carga recibía «revisa sus ventas», «cambiar de lugar» y «retirar»)", () => {
    // 10 colgados hace 10 días, 8 vendidos en 16 horas, 3 en el almacén; su estación terminó el día 100. El de la carga no
    // tiene dato de rapidez (sus ventas salieron de lo que no tiene edad), pero vendió en sus últimos 30 días en el piso:
    // recibe la misma pregunta que su gemelo pilar, nunca «trasladar» (ADR-0208, «Revisión 9 del paso 3»).
    const { tallas, eventos } = fondoDeBlusas();
    for (const [id, primera] of [
      ["BIK-LOTE", {}],
      ["BIK-CARGA", { edadDesconocida: true }],
    ] as const) {
      tallas.push(talla(id, id, { primeraExhibicion: ts(110), pisoHoy: 2, almacenHoy: 3, finEstacion: ts(100) }));
      eventos[id] = [bajada(110, 10, primera), ...Array.from({ length: 8 }, (_, i) => venta(110, 1, (2 + 2 * i) * 60))];
    }
    const { sede } = analizarSede(lectura(tallas, eventos));
    const lote = prendaDe(sede, "BIK-LOTE");
    const carga = prendaDe(sede, "BIK-CARGA");
    expect(lote.rapidez?.indice).toBeGreaterThanOrEqual(100);
    expect(lote.estado).toMatchObject({ temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] });
    expect(carga.rapidez).toBeNull();
    expect(carga.ventasRecientes).toBe(8);
    expect(carga.estado).toMatchObject({ temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] });
    expect(carga.estado.sugerencias).toEqual(lote.estado.sugerencias);
    // El que no vendió en sus últimos 30 días en el piso sigue con su escalera y «retirar»: la regla es «se sigue
    // vendiendo», no «no tiene dato». La misma historia, 40 días antes (la lectura lo tiene colgado 50 días y sus ventas
    // son de hace 49): dejó de venderse.
    const vieja = fondoDeBlusas();
    vieja.tallas.push(talla("BIK-CARGA-V", "BIK-CARGA-V", { primeraExhibicion: ts(70), pisoHoy: 2, almacenHoy: 3, finEstacion: ts(100) }));
    vieja.eventos["BIK-CARGA-V"] = [bajada(70, 10, { edadDesconocida: true }), ...Array.from({ length: 8 }, (_, i) => venta(70, 1, (2 + 2 * i) * 60))];
    const cargaVieja = prendaDe(analizarSede(lectura(vieja.tallas, vieja.eventos)).sede, "BIK-CARGA-V");
    expect(cargaVieja.rapidez).toBeNull();
    expect(cargaVieja.ventasRecientes).toBe(0);
    expect(cargaVieja.estado.sugerencias).toEqual(["revisar_ventas", "cambiar_lugar", "retirar"]);
  });

  it("la carga inicial se agotó hace 100 días y lo repuesto por lote hace 20 no vendió ni una: lenta y «Por decidir» (antes, «sin dato» por las ventas de la carga)", () => {
    // Las ventas de la carga son de ANTES de que colgara lo repuesto: no pueden haberle quitado ventas. Si la carga
    // todavía estaba colgada cuando llegó lo repuesto (la tercera venta, el día 101), el FIFO sí puede equivocarse: se
    // mide de las dos maneras (R7-3). Aun si esa venta era de lo repuesto, 1 de 5 en 20 días contra blusas que se venden
    // en 2 a 10 días es lenta: lenta las dos veces (antes, sin dato). Las gemelas K y U, donde contarlas cambia el
    // veredicto, siguen sin dato.
    const repuesta = (terceraVenta: number) => {
      const { tallas, eventos } = fondoDeBlusas();
      tallas.push(talla("REP", "repuesta", { primeraExhibicion: ts(10), pisoHoy: 5, almacenHoy: 2, temporada: null, temporadaOrigen: null }));
      eventos.REP = [bajada(10, 3, { edadDesconocida: true }), venta(12, 1), venta(15, 1), venta(terceraVenta, 1), bajada(100, 5)].sort((a, b) => a.ts.localeCompare(b.ts));
      return analizarSede(lectura(tallas, eventos)).sede;
    };
    const sede = repuesta(20);
    const p = prendaDe(sede, "repuesta");
    expect(p.rapidez).toMatchObject({ indice: 0, vendidas: 0, referencia: 100 });
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true });
    expect(p.estado.sugerencias).toContain("cambiar_lugar");
    expect(p.estado.sugerencias).toContain("trasladar");
    expect(sede.cifras.porDecidir).toBe(1);
    const ambigua = prendaDe(repuesta(101), "repuesta");
    expect(ambigua.rapidez).toMatchObject({ indice: 0, vendidas: 0 });
    expect(ambigua.estado).toMatchObject({ tramo: "critica", quieta: true });
    // En el MISMO instante en que se cuelga lo repuesto tampoco se sabe cuál se vendió: la misma cuenta doble.
    expect(prendaDe(repuesta(100), "repuesta").rapidez).toMatchObject({ indice: 0 });
  });

  it("A1: de la curva se resta solo lo que la prenda aporta a la VARA; sus unidades viejas de la lectura se miden, no se restan (un pilar no se vuelve lento)", () => {
    // Vara de 30 días (blusas que venden en 1 a 5 días). X colgó 4 el día 50 (antes de la ventana de la vara) y los vendió
    // a los 1, 2, 3 y 4 días; hoy tiene 2 recién colgadas (día 119,5). Sus 4 viejas NO están en la curva de 30 días.
    // Esperadas a mano: la curva del resto = las 25 blusas (H = 0,2 | 0,45 | 0,7833 | 1,2833 | 2,2833 a 1-5 días).
    // Sus 4 vendidas esperan H(1) + H(2) + H(3) + H(4) = 2,7167; las 2 colgadas medio día, 0 → índice 4 ÷ 2,7167 = 147.
    const vara = varaDeBlusas(92);
    const conVentas = (n: number, ventas: EventoPiso[]) => {
      const x = talla("X1", "X", { primeraExhibicion: ts(50), pisoHoy: 2 });
      const { sede } = analizarSede(lectura([...vara.tallas, x], { ...vara.eventos, X1: [bajada(50, n), ...ventas, bajada(119.5, 2)] }));
      expect(sede.categorias[0].ventanaDias).toBe(30);
      return prendaDe(sede, "X");
    };
    const cuatro = conVentas(4, [venta(51, 1), venta(52, 1), venta(53, 1), venta(54, 1)]);
    expect(cuatro.rapidez).toMatchObject({ vendidas: 4, esperadas: 2.72, indice: 147, referencia: 25 });
    // Con 12 (3 por día): restando también sus 12 viejas, el índice bajaba a 85 y el pilar iba a «Por decidir».
    const doce = conVentas(12, [51.5, 52.5, 53.5, 54.5].map((d) => venta(d, 3)));
    expect(doce.rapidez?.indice).toBe(147);
    expect(doce.estado).toMatchObject({ quieta: false, sugerencias: [] });
  });

  it("las bajadas tardías salen también de la rapidez (toda la lectura) y de la vara de 120 días", () => {
    // Una categoría lenta (vara de 120 días) y una prenda con una bajada tardía de 2, vendida a los 3 minutos.
    const tallas: TallaFrescuraCruda[] = [];
    const eventos: Record<string, EventoPiso[]> = {};
    for (let i = 0; i < 10; i++) {
      tallas.push(talla(`vend-${i}`, `vendedora-${i}`, { primeraExhibicion: ts(20) }));
      eventos[`vend-${i}`] = [bajada(20, 5, { oid: `b-${i}` }), venta(21, 1), venta(22, 1), venta(23, 1), venta(24, 1), venta(25, 1)];
    }
    tallas.push(talla("tarde", "tarde", { primeraExhibicion: ts(100), pisoHoy: 3 }));
    eventos.tarde = [bajada(100, 3), bajada(110, 2, { oid: "b-tarde" }), venta(110, 2, 3)];
    const { sede } = analizarSede(lectura(tallas, eventos, { tardias: [{ oid: "b-tarde", varianteId: "tarde", bajadaEn: ts(110), unidadesTardias: 2 }] }));
    expect(sede.categorias[0]).toMatchObject({ ventanaDias: 120, vendidas: 50 });
    expect(prendaDe(sede, "tarde").rapidez?.vendidas).toBe(0);
  });

  it("ventas recientes (D4+D6): un retiro al almacén no es una venta, y la venta de OTRA talla del mismo modelo+color sí cuenta", () => {
    // Vestidos con un solo modelo (sin él no queda contra qué medirlo: sin tramo). Colgados el día 1, 1 vendido el día 5 y
    // 1 retirado al almacén el día 110: nada vendido en 30 días → «revisa sus ventas».
    const v = talla("V", "vestido", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(1), pisoHoy: 8, almacenHoy: 1 });
    const retirado = analizarSede(lectura([v], { V: [bajada(1, 10), venta(5, 1), ev(110, -1, { esMovimientoInterno: true })] })).sede.prendas[0];
    expect(retirado.ventasRecientes).toBe(0);
    expect(retirado.estado).toMatchObject({ tipo: "sin_vara", sugerencias: ["revisar_ventas"] });
    // S sin ventas y M con una venta el día 110 (hace 10 días): el modelo+color vendió, no está callado.
    const s = talla("V-S", "vestido", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "S", primeraExhibicion: ts(1), pisoHoy: 5 });
    const m = talla("V-M", "vestido", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "M", primeraExhibicion: ts(1), pisoHoy: 4 });
    const conOtraTalla = analizarSede(lectura([s, m], { "V-S": [bajada(1, 5)], "V-M": [bajada(1, 5), venta(110, 1)] })).sede.prendas[0];
    expect(conOtraTalla.ventasRecientes).toBe(1);
    expect(conOtraTalla.estado.sugerencias).toEqual([]);
  });
});

describe("analizarSede: casos de la revisión 7 (decisiones de Felipe y reglas corregidas)", () => {
  const prendaDe = (sede: ReturnType<typeof analizarSede>["sede"], productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;

  it("R7-1 · lo apartado para una clienta no está colgado: la separación de hace 50 días no envejece ni va a «Por decidir»; su gemela libre sí", () => {
    // Las dos: 4 colgadas el día 60 y 1 vendida al día siguiente. A la apartada le apartan las 3 que quedan el día 70
    // (Felipe, 2026-09-27). Antes las dos eran Crítica, quietas y con «cambiar de lugar»: «Por decidir» 2 en vez de 1.
    const { tallas, eventos } = fondoDeBlusas();
    const historia = [bajada(60, 4), venta(61, 1)];
    tallas.push(talla("AP", "apartada", { primeraExhibicion: ts(60), pisoHoy: 0, apartadasHoy: 3 }));
    tallas.push(talla("LIB", "libre", { primeraExhibicion: ts(60), pisoHoy: 3 }));
    const { sede } = analizarSede(lectura(tallas, { ...eventos, AP: historia, LIB: historia }, { apartados: { AP: [{ ts: ts(70), delta: -3 }] } }));
    const ap = prendaDe(sede, "apartada");
    const libre = prendaDe(sede, "libre");
    expect(ap).toMatchObject({ pisoHoy: 0, apartadasHoy: 3, reloj: { segundos: 10 * D, alMenos: false } });
    expect(ap.tallas).toEqual([{ varianteId: "AP", talla: "M", pisoHoy: 0, almacenHoy: 0, apartadasHoy: 3, apartadasPisoHoy: 3 }]);
    expect(ap.estado).toMatchObject({ quieta: false, sugerencias: [] });
    expect(libre.reloj.segundos).toBe(60 * D);
    expect(libre.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true });
    expect(sede.cifras.porDecidir).toBe(1);
    // Lo apartado tampoco pesa en la edad del piso: solo cuenta la libre (60 días, 3 unidades) y el fondo.
    const soloLibre = analizarSede(lectura(tallas.filter((t) => t.varianteId !== "AP"), { ...eventos, LIB: historia })).sede.cifras;
    expect(sede.cifras).toMatchObject({ unidadesEnPiso: soloLibre.unidadesEnPiso, edadDelPisoDias: soloLibre.edadDelPisoDias });
    // Lo apartado de la prenda es el de todas sus tallas.
    const dos = [talla("AP2-S", "dos", { talla: "S", apartadasHoy: 1 }), talla("AP2-M", "dos", { apartadasHoy: 2 })];
    expect(prendaDe(analizarSede(lectura(dos, {})).sede, "dos").apartadasHoy).toBe(3);
  });

  it("R7-1 · el reloj no corre mientras todo lo colgado está apartado, y sigue donde iba al liberarse; apartar una parte no lo detiene", () => {
    const reloj = (apartados: { ts: string; delta: number }[][], tallas: EventoPiso[][] = [[bajada(0, 3)]]) =>
      relojNovedad({ eventosPorTalla: tallas, apartadosPorTalla: apartados, primeraExhibicion: ts(0), desde: ts(0), ahora: ts(40) });
    expect(reloj([[]]).segundos).toBe(40 * D);
    // Apartada entera del día 10 al 30 (la clienta no vino): 10 + 10.
    expect(reloj([[{ ts: ts(10), delta: -3 }, { ts: ts(30), delta: 3 }]]).segundos).toBe(20 * D);
    // Apartadas 2 de 3: la que queda sigue colgada.
    expect(reloj([[{ ts: ts(10), delta: -2 }]]).segundos).toBe(40 * D);
    // La S apartada entera y la M libre: el modelo+color sigue colgado.
    expect(reloj([[{ ts: ts(10), delta: -3 }], []], [[bajada(0, 3)], [bajada(0, 1)]]).segundos).toBe(40 * D);
    // Apartada desde antes de la ventana (el saldo, a la hora de «desde»): no corre nada, y sigue «al menos».
    const antes = relojNovedad({
      eventosPorTalla: [[bajada(0, 2, { edadDesconocida: true })]],
      apartadosPorTalla: [[{ ts: ts(0), delta: -2 }]],
      primeraExhibicion: ts(-10),
      desde: ts(0),
      ahora: ts(40),
    });
    expect(antes).toEqual({ segundos: 0, alMenos: true });
  });

  it("R7-1 · lee `apartados` y `apartadas_hoy`, descarta lo que no tiene forma; sin la clave (una base de antes), nada apartado", () => {
    const prenda = { variante_id: "v1", producto_id: "p1", piso_hoy: 1, almacen_hoy: 0, apartadas_hoy: "2" };
    const l = leerFrescuraSede({ separa_piso: true, desde: ts(0), ahora: ts(10), prendas: [prenda], eventos: {}, apartados: { v1: [[ts(3), -2], ["no es fecha", 1], [ts(4), 0]] } });
    if (!l?.separaPiso) throw new Error("sin lectura");
    expect(l.tallas[0]).toMatchObject({ pisoHoy: 1, apartadasHoy: 2 });
    expect(l.apartados).toEqual({ v1: [{ ts: ts(3), delta: -2 }] });
    const vieja = leerFrescuraSede({ separa_piso: true, desde: ts(0), ahora: ts(10), prendas: [{ variante_id: "v1", producto_id: "p1" }] });
    if (!vieja?.separaPiso) throw new Error("sin lectura");
    expect(vieja.apartados).toEqual({});
    expect(vieja.tallas[0].apartadasHoy).toBe(0);
  });

  it("paso 4 · lee `apartadas_piso_hoy` (lo apartado en el PISO); sin la clave (producción antes del paso 4), lo deduce de `apartados` (−Σ delta), nunca más que lo apartado", () => {
    const leer = (prendas: Record<string, unknown>[], apartados: Record<string, [string, number][]> = {}) => {
      const l = leerFrescuraSede({ separa_piso: true, desde: ts(0), ahora: ts(10), prendas, eventos: {}, apartados });
      if (!l?.separaPiso) throw new Error("sin lectura");
      return l.tallas.map((t) => [t.varianteId, t.apartadasHoy, t.apartadasPisoHoy]);
    };
    // Con la clave: manda la base (1 del piso y 1 del almacén).
    expect(leer([{ variante_id: "v1", producto_id: "p1", apartadas_hoy: 2, apartadas_piso_hoy: 1 }])).toEqual([["v1", 2, 1]]);
    // Sin la clave: el saldo y los puntos del piso (−2 al empezar, +1 liberada) dejan 1 apartada en el piso.
    const saldo: [string, number][] = [[ts(0), -2], [ts(3), 1]];
    expect(leer([{ variante_id: "v1", producto_id: "p1", apartadas_hoy: 3 }], { v1: saldo })).toEqual([["v1", 3, 1]]);
    // Sin puntos en el piso: todo lo apartado está en el almacén.
    expect(leer([{ variante_id: "v2", producto_id: "p1", apartadas_hoy: 1 }])).toEqual([["v2", 1, 0]]);
    // Nunca más que lo apartado ni menos que 0 (un dato raro no inventa apartadas).
    expect(leer([{ variante_id: "v3", producto_id: "p1", apartadas_hoy: 1 }], { v3: [[ts(1), -5]] })).toEqual([["v3", 1, 1]]);
    expect(leer([{ variante_id: "v4", producto_id: "p1", apartadas_hoy: 1 }], { v4: [[ts(1), 2]] })).toEqual([["v4", 1, 0]]);
    // La prenda suma lo de sus tallas.
    const dos = [talla("AP3-S", "tres", { talla: "S", apartadasHoy: 2, apartadasPisoHoy: 0 }), talla("AP3-M", "tres", { apartadasHoy: 1 })];
    expect(prendaDe(analizarSede(lectura(dos, {})).sede, "tres")).toMatchObject({ apartadasHoy: 3, apartadasPisoHoy: 1 });
  });

  it("R7-2 · el éxito que se agotó y se repuso ayer no «dejó de vender»: sus últimos 30 días en el piso son 1 desde ayer y 29 antes de agotarse. Sigue pilar, sin «trasladar»; con la temporada pasada, «sigue vendiendo»", () => {
    // 3 colgadas desde el día 25; cada día se vende una y se baja otra, hasta que el almacén se vacía: el piso queda en 0
    // el día 85 (hace 35). Ayer se colgaron 5 de la reposición y quedan 15 en el almacén. Antes: 0 ventas en los 30 días
    // de calendario → «dejó de vender» → no pilar → Crítica, quieta, «cambiar de lugar» y «trasladar».
    const agotado = (finEstacion: string | null) => {
      const { tallas, eventos } = fondoDeBlusas();
      tallas.push(talla("PA", "pilar", { primeraExhibicion: ts(25), pisoHoy: 5, almacenHoy: 15, finEstacion }));
      const e: EventoPiso[] = [bajada(25, 3)];
      for (let d = 26; d <= 82; d++) e.push(venta(d, 1), bajada(d, 1, {}, 60));
      e.push(venta(83, 1), venta(84, 1), venta(85, 1), bajada(119, 5));
      eventos.PA = e;
      return prendaDe(analizarSede(lectura(tallas, eventos)).sede, "pilar");
    };
    const p = agotado(null);
    expect(p.reloj.segundos).toBe(61 * D);
    // Sus últimos 30 días en el piso: el de ayer y los días 56 a 85 (30 ventas).
    expect(p.ventasRecientes).toBe(30);
    expect(p.rapidez?.indice).toBeGreaterThanOrEqual(100);
    expect(p.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: false, sugerencias: [] });
    expect(agotado(ts(100)).estado).toMatchObject({ temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] });
  });

  it("R7-2 · días en el piso, no de calendario: guardada 50 días en el almacén no cuenta como «sin vender»; 30 días en el piso sin una venta sí, aunque tenga una pausa en medio", () => {
    // Colgada del día 40 al 50 (vendió 1 el 45) y guardada hasta el día 100; ahora lleva 20 días colgada otra vez. Sus
    // últimos 30 días en el piso son los 20 de ahora y los días 40 a 50: vendió. Sin esa venta, dejó de vender.
    const pausa = (conVenta: boolean) => {
      const v = talla("G", "guardada", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(40), pisoHoy: 2 });
      const e = [bajada(40, 3), ...(conVenta ? [venta(45, 1)] : []), ev(50, conVenta ? -2 : -3, { esMovimientoInterno: true }), bajada(100, 2)];
      return analizarSede(lectura([v], { G: e })).sede.prendas[0];
    };
    expect(pausa(true)).toMatchObject({ ventasRecientes: 1, estado: { sugerencias: [] } });
    expect(pausa(false)).toMatchObject({ ventasRecientes: 0, estado: { tipo: "sin_ventas_sede", sugerencias: ["revisar_ventas"] } });
    // Cuenta hacia atrás solo lo colgado: tramos [0, 10) y [20, 40) en días.
    const M = 86_400_000;
    const tramos = [0, 10 * M, 20 * M, 40 * M];
    expect(inicioDeSusUltimosDias(tramos, 5)).toBe(35 * M);
    expect(inicioDeSusUltimosDias(tramos, 20)).toBe(20 * M);
    expect(inicioDeSusUltimosDias(tramos, 25)).toBe(5 * M);
    expect(inicioDeSusUltimosDias(tramos, 30)).toBe(0);
    expect(inicioDeSusUltimosDias(tramos, 31)).toBeNull();
  });

  it("R7-3 · una devolución revendida no le quita la rapidez al éxito del lote: el bikini de temporada pasada con una devuelta sigue pilar y recibe «sigue vendiendo», como su gemelo", () => {
    // 10 colgados el día 110, 8 vendidos en 16 horas. Al devuelto le devuelven uno a las 20 horas (vuelve al piso sin
    // lote: edad desconocida), se venden 2 más y la tercera, a las 40 horas, es la devuelta. A las 48 horas bajan 3. Antes
    // el devuelto quedaba sin rapidez por toda la lectura: «revisa sus ventas», «cambiar de lugar» y «retirar».
    const { tallas, eventos } = fondoDeBlusas();
    const comun = (id: string) => talla(id, id, { primeraExhibicion: ts(110), pisoHoy: 3, finEstacion: ts(100) });
    tallas.push(comun("DEV"), comun("GEM"));
    const ocho = Array.from({ length: 8 }, (_, i) => venta(110, 1, (2 + 2 * i) * 60));
    eventos.DEV = [bajada(110, 10), ...ocho, ev(110, 1, { edadDesconocida: true }, 20 * 60), venta(110, 1, 30 * 60), venta(110, 1, 34 * 60), venta(110, 1, 40 * 60), bajada(112, 3)];
    eventos.GEM = [bajada(110, 10), ...ocho, venta(110, 1, 30 * 60), venta(110, 1, 34 * 60), bajada(112, 3)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    const dev = prendaDe(sede, "DEV");
    const gem = prendaDe(sede, "GEM");
    expect(gem.rapidez?.indice).toBeGreaterThanOrEqual(100);
    expect(dev.rapidez).toEqual(gem.rapidez);
    expect(dev.estado).toMatchObject({ temporadaPasada: true, quieta: true, sugerencias: ["sigue_vendiendo"] });
    expect(gem.estado.sugerencias).toEqual(["sigue_vendiendo"]);
  });
});

/** Un punto de lo apartado del piso (apartar resta, liberar suma), el día `dia` a los `minuto` minutos. */
const ap = (dia: number, delta: number, minuto = 0): PuntoApartado => ({ ts: ts(dia, minuto), delta });
/** Cada evento como texto: día (con minutos si los hay), delta y clase (v venta, i interno, - otro; ? edad desconocida). */
const forma = (evs: readonly EventoPiso[]) =>
  evs.map((e) => {
    const minutos = Math.round((Date.parse(e.ts) - BASE) / 60_000);
    const dia = Math.floor(minutos / 1440);
    const resto = minutos - dia * 1440;
    return `${dia}${resto ? `+${resto}m` : ""}:${e.delta}${e.esVenta ? "v" : e.esMovimientoInterno ? "i" : "-"}${e.edadDesconocida ? "?" : ""}`;
  });

// Revisión 8 (2026-09-27, noche): R7-1 completo. Hasta aquí lo apartado solo detenía el reloj; el FIFO de la vara lo veía
// como colgado y sin vender. La prenda con 5 de 6 unidades apartadas salía rapidez 0, Envejecida, quieta y con
// «trasladar», y su gemela que vendió esas 5 en los mismos instantes salía 136, Vigente y sin sugerencias.
describe("revisión 8: lo apartado en la vara, la rapidez y las ventas recientes (R7-1 completo)", () => {
  const prendaDe = (sede: ReturnType<typeof analizarSede>["sede"], productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;

  it("sin nada apartado, los mismos eventos", () => {
    const evs = [bajada(0, 3), venta(5, 1)];
    expect(eventosConApartados(evs, undefined)).toBe(evs);
    expect(eventosConApartados(evs, [])).toBe(evs);
  });

  it("lo que sigue apartado es una venta desde que se apartó (después de una bajada del mismo instante)", () => {
    expect(forma(eventosConApartados([bajada(0, 3)], [ap(5, -1)]))).toEqual(["0:3i", "5:-1v"]);
    expect(forma(eventosConApartados([bajada(0, 1), bajada(5, 1)], [ap(5, -1)]))).toEqual(["0:1i", "5:1i", "5:-1v"]);
    // Apartado antes de la lectura (el saldo, a la hora de «desde»): sale del saldo, que ya está colgado.
    expect(forma(eventosConApartados([bajada(0, 3, { edadDesconocida: true })], [ap(0, -2)]))).toEqual(["0:3i?", "0:-2v"]);
  });

  it("la entrega (se libera y se vende enseguida) es la venta de cuando se apartó: la venta de la entrega no se cuenta dos veces", () => {
    // Entregar una separación: la liberación y la venta en el mismo instante.
    expect(forma(eventosConApartados([bajada(0, 3), venta(20, 1)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1v"]);
    // «Se la entrego a la clienta ahora» de Apartados y cobrada en Vender 5 minutos después.
    expect(forma(eventosConApartados([bajada(0, 3), venta(20, 1, 5)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1v"]);
    // Una venta de 2 en la entrega de 1: la otra unidad es una venta más.
    expect(forma(eventosConApartados([bajada(0, 3), venta(20, 2)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1v", "20:-1v"]);
    // Liberadas 2 y vendida 1 enseguida: 1 entregada (venta al apartarse) y 1 que vuelve (pausa).
    expect(forma(eventosConApartados([bajada(0, 3), venta(20, 1)], [ap(5, -2), ap(20, 2)]))).toEqual(["0:3i", "5:-1v", "5:-1i", "20:1i"]);
  });

  it("lo que se libera sin venderse enseguida es una pausa: no suma días colgada mientras estuvo apartado, y vuelve con su edad", () => {
    // La clienta no vino: apartada del día 5 al 20.
    const vuelta = eventosConApartados([bajada(0, 3)], [ap(5, -1), ap(20, 1)]);
    expect(forma(vuelta)).toEqual(["0:3i", "5:-1i", "20:1i"]);
    // Las 2 libres llevan 40 días; la que estuvo apartada, 5 + 20 = 25 (antes, 40 como las otras).
    expect(observacionesDe(vuelta, ts(40)).sort((a, b) => a.segundos - b.segundos)).toEqual([colgada(25), colgada(40, 2)]);
    // Cobrada 11 minutos después de liberarla: ya no es la entrega. Pausa, y la venta es una venta más del FIFO.
    expect(forma(eventosConApartados([bajada(0, 3), venta(20, 1, 11)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1i", "20:1i", "20+11m:-1v"]);
    // Apartada y liberada en el mismo instante: no estuvo apartada, no hay nada que pausar.
    expect(forma(eventosConApartados([bajada(0, 3)], [ap(5, -1), ap(5, 1)]))).toEqual(["0:3i"]);
    // Una venta de OTRA unidad antes de liberarla no es su entrega.
    expect(forma(eventosConApartados([bajada(0, 3), venta(15, 1)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1i", "15:-1v", "20:1i"]);
  });

  it("cada liberación cierra lo más viejo que seguía apartado; lo que se libera sin nada apartado no mueve el FIFO", () => {
    // Apartadas el día 5 y el 10; una liberada el 20 (la del 5, que vuelve); la del 10 sigue apartada (venta).
    expect(forma(eventosConApartados([bajada(0, 3)], [ap(5, -1), ap(10, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1i", "10:-1v", "20:1i"]);
    // El libro no cuadra: una liberación sin nada apartado antes.
    expect(forma(eventosConApartados([bajada(0, 2), venta(8, 1)], [ap(5, 1)]))).toEqual(["0:2i", "8:-1v"]);
  });

  it("la apartada es su gemela vendida: P apartó 5 de 6 (4 al colgarse y 1 hace 10 días), Q vendió esas 5 en los mismos instantes y PE las entregó después. Misma rapidez, mismo estado, mismas sugerencias y las mismas ventas recientes", () => {
    // Antes: P rapidez 0, Envejecida, quieta y «trasladar»; PE contaba sus 4 entregas a los 40 días de colgada.
    const { tallas, eventos } = fondoDeBlusas();
    const comun = { primeraExhibicion: ts(60), pisoHoy: 1, almacenHoy: 2 };
    tallas.push(talla("P", "P", { ...comun, apartadasHoy: 5 }));
    tallas.push(talla("Q", "Q", comun));
    tallas.push(talla("PE", "PE", { ...comun, apartadasHoy: 1 }));
    const apartadas = [ap(61, -1), ap(62, -1), ap(63, -1), ap(64, -1)];
    const l = lectura(
      tallas,
      {
        ...eventos,
        P: [bajada(60, 6)],
        Q: [bajada(60, 6), venta(61, 1), venta(62, 1), venta(63, 1), venta(64, 1), venta(110, 1)],
        PE: [bajada(60, 6), venta(100, 4)],
      },
      { apartados: { P: [...apartadas, ap(110, -1)], PE: [...apartadas, ap(100, 4), ap(110, -1)] } },
    );
    const { sede } = analizarSede(l);
    const [p, q, pe] = ["P", "Q", "PE"].map((id) => prendaDe(sede, id));
    expect(q.rapidez).not.toBeNull();
    expect(p.rapidez).toEqual(q.rapidez);
    expect(pe.rapidez).toEqual(q.rapidez);
    for (const x of [p, pe]) {
      expect(x.estado).toEqual(q.estado);
      expect(x.ventasRecientes).toBe(q.ventasRecientes);
      expect(x.reloj).toEqual(q.reloj);
    }
    expect(q.ventasRecientes).toBe(1);
    // La vara de la categoría tampoco cambia: las apartadas de P son las ventas de Q (antes eran «al menos 60 días» y
    // corrían los cortes de las demás prendas).
    const soloCon = (id: "P" | "Q") =>
      analizarSede({ ...l, tallas: l.tallas.filter((t) => t.varianteId === id || t.varianteId.startsWith("fondo-")) }).sede.categorias;
    expect(soloCon("P")).toEqual(soloCon("Q"));
  });

  it("lo que se liberó sin venderse no es una venta, ni reciente; lo apartado antes de la lectura tampoco es reciente", () => {
    const { tallas, eventos } = fondoDeBlusas();
    // PL: le apartaron 4 al colgarse y las liberaron el día 100 (la clienta no vino). Vendió 0.
    tallas.push(talla("PL", "PL", { primeraExhibicion: ts(60), pisoHoy: 6 }));
    // PA: 2 apartadas desde antes de la lectura (el saldo), nada libre.
    tallas.push(talla("PA", "PA", { primeraExhibicion: ts(-20), apartadasHoy: 2 }));
    const { sede } = analizarSede(
      lectura(tallas, { ...eventos, PL: [bajada(60, 6)], PA: [bajada(0, 2, { edadDesconocida: true })] }, {
        apartados: { PL: [ap(61, -1), ap(62, -1), ap(63, -1), ap(64, -1), ap(100, 4)], PA: [ap(0, -2)] },
      }),
    );
    const pl = prendaDe(sede, "PL");
    expect(pl.ventasRecientes).toBe(0);
    expect(pl.rapidez?.vendidas).toBe(0);
    expect(prendaDe(sede, "PA").ventasRecientes).toBe(0);
  });

  it("lo apartado de CUALQUIER talla detiene el reloj y es una venta reciente, no solo lo de la primera talla (verificación de la revisión 7)", () => {
    const { tallas, eventos } = fondoDeBlusas();
    // M y S colgadas el día 60; la M se vende el día 70 y la S se aparta el 71 y sigue apartada: nada libre desde el 71.
    tallas.push(talla("DT-M", "dos-tallas", { talla: "M", primeraExhibicion: ts(60) }));
    tallas.push(talla("DT-S", "dos-tallas", { talla: "S", primeraExhibicion: ts(60), apartadasHoy: 1 }));
    const { sede } = analizarSede(
      lectura(tallas, { ...eventos, "DT-M": [bajada(60, 1), venta(70, 1)], "DT-S": [bajada(60, 1)] }, { apartados: { "DT-S": [ap(71, -1)] } }),
    );
    const p = prendaDe(sede, "dos-tallas");
    // Mirando solo lo apartado de la M: 60 días colgada y ninguna venta en sus últimos 30 (del 90 al 120).
    expect(p).toMatchObject({ pisoHoy: 0, apartadasHoy: 1, reloj: { segundos: 11 * D }, ventasRecientes: 2 });
  });
});

// Revisión 9 (2026-09-28): lo apartado dentro de los 10 minutos de una bajada (N1, F1, F2), la separación liberada que
// vuelve con su edad (N2), lo que nunca se colgó (N3) y las pruebas que faltaban (bordes y lecturas con las tardías).
describe("revisión 9: lo apartado junto a una bajada tardía, la pausa que vuelve con su edad, lo que nunca se colgó y los bordes", () => {
  const prendaDe = (sede: ReturnType<typeof analizarSede>["sede"], productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;
  const MODOS = ["VENDIDA", "SEPARADA", "ENTREGADA", "PEDIDO"] as const;

  /**
   * Las gemelas de N1, F1 y F2, sobre el fondo de blusas. Cada una: la S colgada hace 12 días sin vender (3 en el piso y
   * 2 en el almacén) y la M con el piso en 0. Tres veces (días 113, 115 y 117) una clienta pide la M y se baja 1:
   *   · VENDIDA: se cobra a los 3 minutos;
   *   · SEPARADA: se la separa a los 3 minutos y sigue separada;
   *   · ENTREGADA: se separa a los 2 minutos y se entrega a los 5 (se libera y se vende en la misma operación);
   *   · PEDIDO: el pedido de otra sede (`separar_pedido_para_apartar`): bajada y separación en el mismo instante.
   * La base marca las tres bajadas tardías en las cuatro (20260928120330: lo apartado en la ventana cuenta como vendido
   * en las tardías de la lectura, no en el indicador de registro).
   */
  function gemelas(): LecturaFrescuraConPiso {
    const { tallas, eventos } = fondoDeBlusas();
    const apartados: Record<string, PuntoApartado[]> = {};
    const tardias: TardiaCruda[] = [];
    for (const modo of MODOS) {
      const s = `${modo}-S`;
      const m = `${modo}-M`;
      tallas.push(talla(s, modo, { talla: "S", primeraExhibicion: ts(108), pisoHoy: 3, almacenHoy: 2 }));
      tallas.push(talla(m, modo, { talla: "M", primeraExhibicion: ts(108), apartadasHoy: modo === "SEPARADA" || modo === "PEDIDO" ? 3 : 0 }));
      eventos[s] = [bajada(108, 3, { oid: `${s}-b` })];
      eventos[m] = [];
      apartados[m] = [];
      for (const dia of [113, 115, 117]) {
        const oid = `${m}-${dia}`;
        eventos[m].push(bajada(dia, 1, { oid }));
        tardias.push({ oid, varianteId: m, bajadaEn: ts(dia), unidadesTardias: 1 });
        if (modo === "VENDIDA") eventos[m].push(venta(dia, 1, 3));
        if (modo === "SEPARADA") apartados[m].push(ap(dia, -1, 3));
        if (modo === "PEDIDO") apartados[m].push(ap(dia, -1));
        if (modo === "ENTREGADA") {
          apartados[m].push(ap(dia, -1, 2), ap(dia, 1, 5));
          eventos[m].push(venta(dia, 1, 5));
        }
      }
    }
    return lectura(tallas, eventos, { apartados, tardias });
  }

  it("N1/F1/F2 · la vendida, la separada, la entregada dentro de los 10 minutos y el pedido de otra sede dan lo MISMO: esas unidades salen de la vara y de la rapidez (antes, la separada y el pedido eran pilar con ventas de 0 a 3 minutos, y la entregada tenía una unidad fantasma)", () => {
    const l = gemelas();
    const { sede } = analizarSede(l);
    const vendida = prendaDe(sede, "VENDIDA");
    // Sin las M (tardías), la prenda es la S: 12 días colgada sin vender, lenta, Crítica y a «Por decidir».
    expect(vendida.rapidez).toMatchObject({ indice: 0, vendidas: 0 });
    expect(vendida.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true, sugerencias: ["cambiar_lugar", "trasladar"] });
    expect(vendida.ventasRecientes).toBe(3);
    for (const modo of MODOS) {
      const p = prendaDe(sede, modo);
      expect(p.rapidez, modo).toEqual(vendida.rapidez);
      expect(p.estado, modo).toEqual(vendida.estado);
      expect(p.reloj, modo).toEqual(vendida.reloj);
      expect(p.ventasRecientes, modo).toBe(vendida.ventasRecientes);
    }
    expect(sede.cifras.porDecidir).toBe(4);
    // La vara de la categoría tampoco cambia: ninguna gemela le suma ventas de 0 a 3 minutos (antes, la separada le sumaba
    // 3 y corría los cortes que juzgan a TODAS las blusas).
    const soloCon = (modo: string) =>
      analizarSede({ ...l, tallas: l.tallas.filter((t) => t.productoId === modo || t.varianteId.startsWith("fondo-")) }).sede.categorias;
    for (const modo of MODOS) expect(soloCon(modo), modo).toEqual(soloCon("VENDIDA"));
  });

  it("F2 · la entrega de una separación dentro de la ventana de su bajada no deja una unidad fantasma: el FIFO de la talla queda vacío, como el piso", () => {
    const l = gemelas();
    const tardias = new Map(l.tardias.map((t) => [t.oid, t.unidadesTardias]));
    const limpios = (id: string) => excluirTardias(eventosConApartados(l.eventos[id], l.apartados?.[id]), tardias);
    for (const modo of MODOS) expect(forma(limpios(`${modo}-M`)), modo).toEqual([]);
    // Al revés (primero las tardías), la entrega quedaba como una pausa sobre un piso vacío y una vuelta que abría una
    // cohorte de más: el FIFO tenía una unidad que el piso no tiene (las entregas siguientes la pausaban y la volvían a
    // colgar).
    const alReves = eventosConApartados(excluirTardias(l.eventos["ENTREGADA-M"], tardias), l.apartados?.["ENTREGADA-M"]);
    expect(historiaDeCohortes(alReves).cohortes.reduce((s, c) => s + c.cantidadRestante, 0)).toBe(1);
  });

  it("N2 · la separación liberada vuelve con SU edad aunque mientras duraba se bajara otra unidad de la misma talla: igual que su gemela guardada en el almacén (antes, la venta siguiente salía sin edad y el pilar de temporada pasada perdía «sigue vendiendo»)", () => {
    const historia = (modo: "apartada" | "guardada") => {
      const e: EventoPiso[] = [bajada(90, 4), venta(91, 1), venta(92, 1)];
      if (modo === "guardada") e.push(ev(95, -1, { esMovimientoInterno: true })); // la guarda en el almacén
      e.push(venta(96, 1), bajada(97, 2));
      if (modo === "guardada") e.push(bajada(105, 1)); // y la vuelve a colgar
      e.push(venta(106, 1), venta(107, 1), venta(108, 1), bajada(115, 2), venta(116, 1));
      return { e: e.sort((a, b) => compararInstantes(a.ts, b.ts)), apartados: modo === "apartada" ? [ap(95, -1), ap(105, 1)] : [] };
    };
    const a = historia("apartada");
    const g = historia("guardada");
    expect(unidadesParaVara(eventosConApartados(a.e, a.apartados), ts(120)).ventasSinEdad).toEqual([]);
    const res = (modo: "apartada" | "guardada") => {
      const { tallas, eventos } = fondoDeBlusas();
      const h = historia(modo);
      tallas.push(talla("B", "bikini", { primeraExhibicion: ts(90), pisoHoy: 1, almacenHoy: 3, finEstacion: ts(100) }));
      eventos.B = h.e;
      return prendaDe(analizarSede(lectura(tallas, eventos, { apartados: { B: h.apartados } })).sede, "bikini");
    };
    const apartada = res("apartada");
    const guardada = res("guardada");
    expect(guardada.rapidez?.indice).toBeGreaterThanOrEqual(100);
    expect(guardada.estado.sugerencias).toEqual(["sigue_vendiendo"]);
    expect(apartada.rapidez).toEqual(guardada.rapidez);
    expect(apartada.estado).toEqual(guardada.estado);
    expect(apartada.ventasRecientes).toBe(guardada.ventasRecientes);
    // Y la curva de la categoría recibe las mismas unidades de las dos.
    const orden = (o: readonly Observacion[]) => [...o].sort((x, y) => x.segundos - y.segundos || Number(x.vendida) - Number(y.vendida));
    expect(orden(observacionesDe(eventosConApartados(a.e, a.apartados), ts(120)))).toEqual(orden(observacionesDe(g.e, ts(120))));
  });

  it("N3 · sin primera exhibición (lo único que entró al piso se apartó en el mismo instante: el pedido de otra sede), el reloj no es «al menos» salvo que algo tenga edad desconocida", () => {
    // El pedido que sigue apartado: se bajó y se apartó en el mismo instante. Nunca se colgó: 0 segundos, «Nueva» posible.
    const pedido = { eventosPorTalla: [[bajada(100, 1)]], apartadosPorTalla: [[ap(100, -1)]], primeraExhibicion: null, desde: ts(0), ahora: ts(120) };
    expect(relojNovedad(pedido)).toEqual({ segundos: 0, alMenos: false });
    // Entregado después (se libera y se vende en el mismo instante): tampoco se colgó.
    expect(relojNovedad({ ...pedido, eventosPorTalla: [[bajada(100, 1), venta(104, 1)]], apartadosPorTalla: [[ap(100, -1), ap(104, 1)]] })).toEqual({
      segundos: 0,
      alMenos: false,
    });
    // Con algo de edad desconocida (el saldo de la lectura), sí es «al menos».
    expect(relojNovedad({ ...pedido, eventosPorTalla: [[bajada(0, 1, { edadDesconocida: true })]], apartadosPorTalla: [[ap(0, -1)]] }).alMenos).toBe(true);
    // Por la sede: la prenda cuyo único paso por el piso fue el pedido y que hoy se cuelga por primera vez es «Nueva».
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("Z", "Z", { primeraExhibicion: ts(118), pisoHoy: 3 }));
    eventos.Z = [bajada(118, 3)];
    expect(prendaDe(analizarSede(lectura(tallas, eventos)).sede, "Z").estado).toMatchObject({ tipo: "semaforo", tramo: "nueva", alMenos: false });
  });

  it("la entrega es la venta de los 10 minutos SIGUIENTES a la liberación, con los dos bordes adentro: a los 10 minutos justos es entrega; un milisegundo después, pausa y una venta más", () => {
    const liberarYVender = (minuto: number) => forma(eventosConApartados([bajada(0, 3), ev(20, -1, { esVenta: true }, minuto)], [ap(5, -1), ap(20, 1)]));
    expect(liberarYVender(10)).toEqual(["0:3i", "5:-1v"]);
    expect(liberarYVender(9.99)).toEqual(["0:3i", "5:-1v"]);
    expect(liberarYVender(10 + 1 / 60_000)).toEqual(["0:3i", "5:-1i", "20:1i", "20+10m:-1v"]);
  });

  it("la venta que delata una bajada tardía es la de [t, t + 10 min], con los dos bordes adentro, como el núcleo: a los 10 minutos justos se quita; un milisegundo después, no", () => {
    const tardia = new Map([["b", 1]]);
    const conVentaA = (minuto: number) => forma(excluirTardias([bajada(0, 1, { oid: "b" }), ev(0, -1, { esVenta: true }, minuto)], tardia));
    expect(conVentaA(10)).toEqual([]);
    expect(conVentaA(9.99)).toEqual([]);
    expect(conVentaA(10 + 1 / 60_000)).toEqual(["0:1i", "0+10m:-1v"]);
  });

  it("la entrega tiene que ser una VENTA: liberar y a los 3 minutos retirar al almacén (la clienta no vino) es una pausa y un retiro, nunca una venta", () => {
    const retiro = (dia: number, minuto: number) => ev(dia, -1, { esMovimientoInterno: true }, minuto);
    expect(forma(eventosConApartados([bajada(0, 3), retiro(20, 3)], [ap(5, -1), ap(20, 1)]))).toEqual(["0:3i", "5:-1i", "20:1i", "20+3m:-1i"]);
    // Por la sede: la apartada que se liberó y se retiró no suma ninguna venta ni reciente.
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("R", "R", { primeraExhibicion: ts(60), pisoHoy: 2, almacenHoy: 1 }));
    eventos.R = [bajada(60, 3), retiro(100, 3)];
    const r = prendaDe(analizarSede(lectura(tallas, eventos, { apartados: { R: [ap(61, -1), ap(100, 1)] } })).sede, "R");
    expect(r.rapidez?.vendidas).toBe(0);
    expect(r.ventasRecientes).toBe(0);
  });

  it("lo que no tiene edad y se va a otra sede (o se pierde) no entra a la curva: la carga inicial trasladada no corre los cortes de su categoría", () => {
    expect(observacionesDe([bajada(0, 3, { edadDesconocida: true }), ev(5, -2)], ts(10))).toEqual([]);
    // Con edad conocida sí entra, como «al menos» los días que estuvo colgada (RZ-6).
    expect(observacionesDe([bajada(0, 3), ev(5, -2)], ts(10)).sort((a, b) => a.segundos - b.segundos)).toEqual([colgada(5, 2), colgada(10, 1)]);
  });

  it("una venta no es la entrega de DOS liberaciones: la segunda, sin venta propia en su ventana, es una pausa (el conteo es el mismo: 1 vendida)", () => {
    const evs = eventosConApartados([bajada(0, 3), venta(20, 1, 3)], [ap(5, -1), ap(10, -1), ap(20, 1), ap(20, 1, 2)]);
    expect(forma(evs)).toEqual(["0:3i", "5:-1v", "10:-1i", "20+2m:1i"]);
    expect(evs.filter((e) => e.esVenta).reduce((s, e) => s - e.delta, 0)).toBe(1);
  });

  it("las ventas recientes y el reloj leen los eventos CON las bajadas tardías: la talla que se trajo del almacén cuando la clienta la pidió vendió en sus últimos 30 días, y ese rato colgada cuenta", () => {
    const { tallas, eventos } = fondoDeBlusas();
    // Dos tallas: la M colgada desde el día 20 (queda 1); la S se agotó el día 23. El día 110 la clienta pide la S: se
    // baja 1 (piso 0) y se vende a los 3 minutos. La base la marca tardía (1): sale de la vara y de la rapidez, no de sus
    // ventas recientes (R7-2, D4+D6).
    tallas.push(talla("TR-M", "TR", { talla: "M", primeraExhibicion: ts(20), pisoHoy: 1, almacenHoy: 1 }));
    tallas.push(talla("TR-S", "TR", { talla: "S", primeraExhibicion: ts(20), almacenHoy: 1 }));
    eventos["TR-M"] = [bajada(20, 2, { oid: "m0" }), venta(21, 1)];
    eventos["TR-S"] = [bajada(20, 2, { oid: "s0" }), venta(22, 1), venta(23, 1), bajada(110, 1, { oid: "st" }), venta(110, 1, 3)];
    const tardias: TardiaCruda[] = [{ oid: "st", varianteId: "TR-S", bajadaEn: ts(110), unidadesTardias: 1 }];
    const tr = prendaDe(analizarSede(lectura(tallas, eventos, { tardias })).sede, "TR");
    expect(tr.ventasRecientes).toBe(1);
    expect(tr.estado.quieta).toBe(false);
    // La única historia es una bajada tardía vendida a los 3 minutos: su reloj son esos 3 minutos (no 0).
    const solo = fondoDeBlusas();
    solo.tallas.push(talla("F", "F", { primeraExhibicion: ts(110) }));
    solo.eventos.F = [bajada(110, 1, { oid: "f" }), venta(110, 1, 3)];
    const f = prendaDe(analizarSede(lectura(solo.tallas, solo.eventos, { tardias: [{ oid: "f", varianteId: "F", bajadaEn: ts(110), unidadesTardias: 1 }] })).sede, "F");
    expect(f.reloj).toEqual({ segundos: 180, alMenos: false });
  });
});

/** 10 vestidos × 3 colgados el día 20 y vendidos los días 30, 50 y 70: la vara de los vestidos (casos RZ). */
function vestidos(): { tallas: TallaFrescuraCruda[]; eventos: Record<string, EventoPiso[]> } {
  const tallas: TallaFrescuraCruda[] = [];
  const eventos: Record<string, EventoPiso[]> = {};
  for (let i = 1; i <= 10; i++) {
    const v = `VARAV-${i}`;
    tallas.push(talla(v, `vestido-${i}`, { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(20, i) }));
    eventos[v] = [bajada(20, 3, {}, i), venta(30, 1, i), venta(50, 1, i), venta(70, 1, i)];
  }
  return { tallas, eventos };
}

// R7-4 a R7-7 (revisión 7): los casos que el revisor escribió (RZ-n) para los cambios a propósito que sobrevivían las 127
// pruebas de la web. Cada uno falla con el cambio que se nombra.
describe("R7-4 a R7-7: las pruebas que faltaban", () => {
  const prendaDe = (sede: ReturnType<typeof analizarSede>["sede"], productoId: string) => sede.prendas.find((p) => p.productoId === productoId)!;

  it("RZ-1 (R7-6) dos colores del mismo modelo son dos prendas: el negro de 100 días sin vender va a «Por decidir», el rojo recién colgado es Nueva (mata: agrupar sin el color)", () => {
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("X-NEG", "X", { colorCodigo: "NEG", colorNombre: "Negro", primeraExhibicion: ts(20), pisoHoy: 2 }));
    tallas.push(talla("X-ROJ", "X", { colorCodigo: "ROJ", colorNombre: "Rojo", primeraExhibicion: ts(118), pisoHoy: 3 }));
    const { sede } = analizarSede(lectura(tallas, { ...eventos, "X-NEG": [bajada(20, 2)], "X-ROJ": [bajada(118, 3)] }));
    const x = sede.prendas.filter((p) => p.productoId === "X");
    expect(x).toHaveLength(2);
    expect(x.find((p) => p.colorCodigo === "NEG")!.estado).toMatchObject({ tipo: "semaforo", tramo: "critica", quieta: true });
    expect(x.find((p) => p.colorCodigo === "ROJ")!.estado).toMatchObject({ tipo: "semaforo", tramo: "nueva", quieta: false });
  });

  it("RZ-2 (R7-6) el almacén de la prenda suma todas sus tallas: con la L en el piso y la S solo en el almacén, «Trasladar» sale (mata: el almacén de la primera talla)", () => {
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("Y-L", "Y", { talla: "L", primeraExhibicion: ts(20), pisoHoy: 2, almacenHoy: 0 }));
    tallas.push(talla("Y-S", "Y", { talla: "S", primeraExhibicion: ts(20), pisoHoy: 0, almacenHoy: 3 }));
    const y = prendaDe(analizarSede(lectura(tallas, { ...eventos, "Y-L": [bajada(20, 2)] })).sede, "Y");
    expect(y.almacenHoy).toBe(3);
    expect(y.estado).toMatchObject({ tramo: "critica", quieta: true, sugerencias: ["cambiar_lugar", "trasladar"] });
  });

  it("RZ-3 (R7-4) manda la PRIMERA talla con edad conocida: M colgada el día 40, la carga de S vende los días 70-85 y L llega el día 118 → sin dato, sin «Trasladar» (mata: la mayor primeraConEdad)", () => {
    // Con las 4 ventas de la S contadas como de lo conocido, 4 contra 3,08 esperadas (M 80 días, L 2 días) = 130: pilar;
    // sin contarlas, 0. Las dos cuentas no dicen lo mismo (R7-3): sin dato. Tomando la L (día 118) como la primera con
    // edad, esas ventas «no esconden nada», la rapidez es 0 y la prenda de 80 días va a «Por decidir» con «Trasladar».
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("T-S", "T", { talla: "S", primeraExhibicion: ts(40), pisoHoy: 6 }));
    tallas.push(talla("T-M", "T", { talla: "M", primeraExhibicion: ts(40), pisoHoy: 1 }));
    tallas.push(talla("T-L", "T", { talla: "L", primeraExhibicion: ts(40), pisoHoy: 4, almacenHoy: 1 }));
    eventos["T-S"] = [bajada(60, 10, { edadDesconocida: true }), venta(70, 1), venta(75, 1), venta(80, 1), venta(85, 1)];
    eventos["T-M"] = [bajada(40, 1)];
    eventos["T-L"] = [bajada(118, 4)];
    const t = prendaDe(analizarSede(lectura(tallas, eventos)).sede, "T");
    expect(t.rapidez).toBeNull();
    expect(t.estado.quieta).toBe(false);
    expect(t.estado.sugerencias).not.toContain("trasladar");
  });

  it("RZ-4 (R7-4) E-Y08 con la talla de la carga PRIMERO en la lista (L de la carga, S repuesta): igual sin dato (mata: mirar solo la primera talla)", () => {
    const { tallas, eventos } = vestidos();
    tallas.push(talla("U-L", "U", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "L", primeraExhibicion: ts(60), pisoHoy: 0 }));
    eventos["U-L"] = [bajada(60, 10, { edadDesconocida: true }), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => venta(63 + 5 * k, 1))];
    tallas.push(talla("U-S", "U", { categoriaId: "vestidos", categoriaNombre: "Vestidos", talla: "S", primeraExhibicion: ts(60), pisoHoy: 4, almacenHoy: 1 }));
    eventos["U-S"] = [bajada(95, 4)];
    const u = prendaDe(analizarSede(lectura(tallas, eventos)).sede, "U");
    expect(u.tallas.map((x) => x.talla)).toEqual(["L", "S"]);
    expect(u.rapidez).toBeNull();
    expect(u.estado.quieta).toBe(false);
    expect(u.estado.sugerencias).not.toContain("trasladar");
  });

  it("RZ-5 (R7-4) la reposición DENTRO de la ventana de la vara no inventa ventas sin edad: lo colgado el día 50 que se vende los días 110 y 112 tiene edad conocida (mata: medir sobre la ventana de la vara)", () => {
    const vara = varaDeBlusas(92);
    const x = talla("X1", "X", { primeraExhibicion: ts(50), pisoHoy: 4 });
    const { sede } = analizarSede(lectura([...vara.tallas, x], { ...vara.eventos, X1: [bajada(50, 4), bajada(100, 2), venta(110, 1), venta(112, 1)] }));
    expect(sede.categorias[0].ventanaDias).toBe(30);
    expect(prendaDe(sede, "X").rapidez).toMatchObject({ vendidas: 2, referencia: 25 });
  });

  it("RZ-6 (R7-7) una salida con edad conocida que NO es venta (traslado a otra sede, merma) entra a la curva como «al menos», no como vendida (mata: toda salida es venta)", () => {
    const u = unidadesParaVara([bajada(1, 2), ev(5, -1)], ts(10));
    expect(vendidasDe(u.observaciones)).toBe(0);
    expect(u.observaciones).toContainEqual({ segundos: 4 * D, vendida: false, peso: 1 });
  });

  it("RZ-7 (R7-7) 20 vendidas con P50 y P75 pero SIN P90 no alcanzan: se usa la de 60 (mata: `alcanza` sin el P90)", () => {
    const v = elegirVentana([
      construirVara([...todasVendidas(20), colgada(100, 4)], 30),
      construirVara(todasVendidas(30), 60),
      construirVara(todasVendidas(40), 90),
      construirVara(todasVendidas(50), 120),
    ]);
    expect(v.ventanaDias).toBe(60);
  });

  it("RZ-8 (R7-7) contra el resto, 9 de 10 vendidas (queda 0,1 exacto) ya es el P90, como en kaplanMeier (mata: el umbral del P90 menos EPS)", () => {
    const resto = [...Array.from({ length: 9 }, (_, i) => vendida(i + 1)), colgada(20)];
    const mia = colgada(30);
    expect(contraElResto(kaplanMeier([...resto, mia]), [mia], [mia]).cortes.p90).toBe(9 * D);
    expect(cortes(kaplanMeier(resto)).p90).toBe(9 * D);
  });

  it("RZ-9 el retiro al almacén que sigue a la venta en los 10 minutos no es la venta que delató la bajada: se quita la venta", () => {
    const out = excluirTardias([bajada(10, 2, { oid: "b" }), venta(10, 1, 2), ev(10, -1, { esMovimientoInterno: true }, 5)], new Map([["b", 1]]));
    expect(out.filter((e) => e.esVenta)).toHaveLength(0);
    expect(out.reduce((s, e) => s + e.delta, 0)).toBe(0);
  });

  it("RZ-10 la venta en el MISMO instante que su bajada (una transacción: el núcleo la cuenta tardía, T28) también se quita", () => {
    expect(excluirTardias([bajada(10, 1, { oid: "b" }), venta(10, 1)], new Map([["b", 1]]))).toEqual([]);
  });

  it("RZ-11 la evidencia mínima es 1: 1 vendida contra 0,5 esperadas ya es un índice (200), y 0 contra 1,2 es lenta (0)", () => {
    expect(rapidez(1, 0.5, 20)).toMatchObject({ indice: 200 });
    expect(rapidez(0, 1.2, 20)).toMatchObject({ indice: 0 });
  });

  it("RZ-12 30 días colgada EXACTOS sin vender ya es «dejó de vender»: el pilar por índice deja de serlo", () => {
    expect(estadoFrescura(entrada({ reloj: { segundos: 30 * D, alMenos: false }, rapidez: r(150), ventasRecientes: 0 }))).toMatchObject({ tramo: "critica", quieta: true });
  });

  it("RZ-13 índice 100 exacto es pilar («como su categoría»)", () => {
    expect(estadoFrescura(entrada({ reloj: { segundos: 40 * D, alMenos: false }, rapidez: r(100), ventasRecientes: 1 }))).toMatchObject({ quieta: false });
  });

  it("RZ-14 el clásico fuera de su estación con todo en el almacén no pide «guardar» (ya está guardado)", () => {
    expect(estadoFrescura(entrada({ esClasico: true, temporada: "clasico_verano", enEstacionAhora: false, pisoHoy: 0, almacenHoy: 3 })).sugerencias).toEqual([]);
  });

  it("RZ-15 la vieja sin dato de rapidez con todo en el almacén no pide «revisa sus ventas»", () => {
    expect(estadoFrescura(entrada({ reloj: { segundos: 40 * D, alMenos: false }, pisoHoy: 0, almacenHoy: 3, ventasRecientes: 1 })).sugerencias).toEqual([]);
  });

  it("RZ-17 lo que la pantalla leerá: última llegada = la más reciente de sus tallas; prendas de la más vieja a la más nueva; categorías por nombre; unidades de la categoría = todas las de la curva", () => {
    const tallas = [
      talla("B-M", "B", { talla: "M", categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(110.5), ultimaLlegada: ts(50), pisoHoy: 1 }),
      talla("B-S", "B", { talla: "S", categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(110.5), ultimaLlegada: ts(10), pisoHoy: 1 }),
      talla("A-M", "A", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(20), pisoHoy: 1 }),
      talla("C-M", "C", { categoriaId: "vestidos", categoriaNombre: "Vestidos", primeraExhibicion: ts(20), pisoHoy: 0 }),
      talla("Z-M", "Z", { categoriaId: "abrigos", categoriaNombre: "Abrigos", primeraExhibicion: ts(20), pisoHoy: 1 }),
    ];
    const eventos = { "B-M": [bajada(110.5, 1)], "B-S": [bajada(110.5, 1)], "A-M": [bajada(20, 2), venta(25, 1)], "C-M": [bajada(20, 2), venta(22, 1), venta(24, 1)], "Z-M": [bajada(20, 1)] };
    const { sede } = analizarSede(lectura(tallas, eventos));
    expect(prendaDe(sede, "B").ultimaLlegada).toBe(ts(50));
    expect(sede.prendas.filter((p) => p.categoriaId === "vestidos").map((p) => p.productoId)).toEqual(["A", "B", "C"]);
    expect(sede.categorias.map((c) => c.categoriaNombre)).toEqual(["Abrigos", "Vestidos"]);
    expect(sede.categorias.find((c) => c.categoriaId === "vestidos")).toMatchObject({ vendidas: 3, unidades: 6 });
  });

  it("RZ-18 cifras: edad del piso y % Nuevas con un decimal", () => {
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("N1", "N1", { primeraExhibicion: ts(119), pisoHoy: 1 }));
    eventos.N1 = [bajada(119, 1)];
    tallas.push(talla("N2", "N2", { primeraExhibicion: ts(110.5), pisoHoy: 2 }));
    eventos.N2 = [bajada(110.5, 2)];
    const { sede } = analizarSede(lectura(tallas, eventos));
    // N1: 1 día, Nueva; N2: 9,5 días, Envejecida. Edad = (1·1 + 2·9,5) ÷ 3 = 6,67 → 6,7; Nuevas 1 de 3 → 33,3 %.
    expect(sede.cifras.edadDelPisoDias).toBe(6.7);
    expect(sede.cifras.pctNuevas).toBe(33.3);
  });

  it("RZ-19 la dudosa (una talla sana y otra dudosa) no se mide: sin rapidez ni «categoría sin ella»", () => {
    const { tallas, eventos } = fondoDeBlusas();
    tallas.push(talla("Q-S", "Q", { talla: "S", primeraExhibicion: ts(20), pisoHoy: 2 }), talla("Q-M", "Q", { talla: "M", primeraExhibicion: ts(20), pisoHoy: 1 }));
    const { sede } = analizarSede(lectura(tallas, { ...eventos, "Q-S": [bajada(20, 2)], "Q-M": [bajada(20, 1)] }, { dudosas: ["Q-M"] }));
    expect(prendaDe(sede, "Q")).toMatchObject({ rapidez: null, categoriaSinElla: null, estado: { tipo: "dudosa" } });
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
