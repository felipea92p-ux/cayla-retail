import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import {
  analizarSede,
  construirVara,
  cortes,
  elegirVentana,
  estadoFrescura,
  estaQuieta,
  excluirTardias,
  kaplanMeier,
  leerConfianzaRegistro,
  leerFrescuraSede,
  nivelPorVentas,
  observacionesDe,
  rapidez,
  recortarEventos,
  referenciaCayla,
  relojNovedad,
  varaPorVentanas,
  sugerenciasDe,
  tramoDe,
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
    expect(tramoDe(dias * D, c, 30 * D)).toBe(tramo);
  });

  it("un corte que la curva no alcanza queda después de su observación más larga: antes de eso se sabe, después no", () => {
    const sinP90 = { p50: 5 * D, p75: 10 * D, p90: null };
    expect(tramoDe(14 * D, sinP90, 15 * D)).toBe("envejecida");
    expect(tramoDe(16 * D, sinP90, 15 * D)).toBeNull();
    expect(tramoDe(3 * D, { p50: null, p75: null, p90: null }, 15 * D)).toBe("nueva");
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

describe("observacionesDe y recortarEventos (sobre el único FIFO)", () => {
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

  it("dice «al menos» si lo primero que entró tiene edad desconocida (carga inicial) o fue una bajada tardía", () => {
    expect(relojNovedad({ eventosPorTalla: [[bajada(3, 2, { edadDesconocida: true })]], primeraExhibicion: ts(3), desde, ahora: ts(10) }).alMenos).toBe(true);
    const tardia = [bajada(3, 2, { oid: "T" }), venta(3, 1, 5)];
    expect(relojNovedad({ eventosPorTalla: [tardia], primeraExhibicion: ts(3), desde, ahora: ts(10), oidsTardios: new Set(["T"]) }).alMenos).toBe(true);
    expect(relojNovedad({ eventosPorTalla: [tardia], primeraExhibicion: ts(3), desde, ahora: ts(10) }).alMenos).toBe(false);
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

describe("rapidez (vendidas contra esperadas a la misma edad)", () => {
  // Categoría: la prenda A vendió a los 1 y 2 días; la B vendió a los 4 y le queda 1 colgada desde hace 5.
  //   H(1) = 1/4, H(2) = 1/4 + 1/3, H(4) = 1/4 + 1/3 + 1/2.
  //   A: 2 vendidas; esperadas H(1) + H(2) = 0,8333 → 240.   B: 1 vendida; esperadas H(4) + H(5) = 2,1667 → 46.
  const a = [vendida(1), vendida(2)];
  const b = [vendida(4), colgada(5)];
  const curva = kaplanMeier([...a, ...b]);

  it("coincide con el cálculo a mano, y entre las dos esperan justo lo que vendió la categoría", () => {
    expect(rapidez(a, curva)).toEqual({ indice: 240, vendidas: 2, esperadas: 0.83 });
    expect(rapidez(b, curva)).toEqual({ indice: 46, vendidas: 1, esperadas: 2.17 });
    expect(rapidez([...a, ...b], curva)?.indice).toBe(100);
  });

  it("recién colgada y sin ventas no es «lenta»: es «sin dato»", () => {
    expect(rapidez([colgada(0.5)], curva)).toBeNull();
    expect(rapidez([colgada(1.5)], curva)).toBeNull(); // esperaba 0,25: poca evidencia
    expect(rapidez([], curva)).toBeNull();
  });
});

const r = (indice: number): Rapidez => ({ indice, vendidas: 1, esperadas: 1 });

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

describe("«Trasladar» solo con «Sólido» y algo en el almacén", () => {
  const PERMITIDAS: readonly Sugerencia[] = ["revisar_ventas", "cambiar_lugar", "trasladar", "retirar", "guardar_hasta_su_estacion"];

  it("en ninguna combinación aparece sin «Sólido», sin almacén o sin dato de rapidez; y «Rebajar» no existe", () => {
    let vistas = 0;
    for (const nivel of [null, "pocos_datos", "aceptable", "solido"] as const)
      for (const almacenHoy of [0, 3])
        for (const rap of [null, r(40), r(150)])
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
                }
              }
    expect(vistas).toBeGreaterThan(0);
  });

  it("por el estado: Crítica y lenta con 3 en el almacén se traslada solo si la vara es «Sólido»", () => {
    const base = { reloj: { segundos: 30 * D, alMenos: false }, rapidez: r(40), almacenHoy: 3 };
    expect(estadoFrescura(entrada(base)).sugerencias).toEqual(["cambiar_lugar", "trasladar"]);
    expect(estadoFrescura(entrada({ ...base, vara: { ...VARA_5_10_20, nivel: "aceptable" } })).sugerencias).toEqual(["cambiar_lugar"]);
    expect(estadoFrescura(entrada({ ...base, almacenHoy: 0 })).sugerencias).toEqual(["cambiar_lugar"]);
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

  it("un clásico nunca pasa a «Temporada pasada»; fuera de su estación se sugiere guardarlo", () => {
    const e = estadoFrescura(entrada({ esClasico: true, temporada: "clasico_verano", finEstacion: ts(90), enEstacionAhora: false }));
    expect(e).toMatchObject({ tipo: "clasico", fueraDeSuEstacion: true, temporadaPasada: false, quieta: false, sugerencias: ["guardar_hasta_su_estacion"] });
    expect(estadoFrescura(entrada({ esClasico: true, temporada: "clasico_todo_el_anio", enEstacionAhora: null })).sugerencias).toEqual([]);
  });

  it("dudosa no se juzga, y una categoría sin ventas en la sede no tiene semáforo", () => {
    expect(estadoFrescura(entrada({ dudosa: true })).tipo).toBe("dudosa");
    expect(estadoFrescura(entrada({ vara: { ...VARA_5_10_20, nivel: null } })).tipo).toBe("sin_ventas_sede");
    expect(estadoFrescura(entrada({ reloj: { segundos: 70 * D, alMenos: false }, vara: { ...VARA_5_10_20, cortes: { p50: 5 * D, p75: null, p90: null } } })).tipo).toBe(
      "sin_vara",
    );
  });
});

describe("leer lo que devuelve la base", () => {
  it("el Taller devuelve solo `separa_piso: false`; una forma rara es un fallo (null), no una sede vacía", () => {
    expect(leerFrescuraSede({ separa_piso: false })).toEqual({ separaPiso: false });
    expect(leerFrescuraSede(null)).toBeNull();
    expect(leerFrescuraSede({ separa_piso: true, desde: "ayer", ahora: ts(1), prendas: [] })).toBeNull();
    expect(leerFrescuraSede({ separa_piso: true, desde: ts(0), ahora: ts(1) })).toBeNull();
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
    // Y su reloj de novedad dice «al menos»: ya estaba colgada antes de registrarse.
    expect(s2.prendas.find((p) => p.productoId === "tarde")?.reloj.alMenos).toBe(true);
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
