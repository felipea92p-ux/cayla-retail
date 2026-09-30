import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventoPiso } from "./inventario-exposicion";
import {
  ACCIONES_DECISION,
  EVIDENCIA_MINIMA,
  PLAZO_MAXIMO_DIAS,
  PLAZO_SIN_REFERENCIA_DIAS,
  aplicarDecisiones,
  armarLibretas,
  completarTraslados,
  desgloseDeRebaje,
  exposicionDeEventos,
  finDePlazo,
  intervenciones,
  leerDecisiones,
  medirLinea,
  medirVentana,
  plazoDeAccion,
  plazoDeCompromiso,
  sugerenciasConHistoria,
  sumarAlResumen,
  terminaLinea,
  ventanaDeLinea,
  type ContextoDeMedicion,
  type ExposicionDe,
  type LecturaDecisiones,
  type RenglonCrudo,
  type Resultado,
} from "./frescura-decisiones-reglas";
import { RAPIDEZ_MIN_EVIDENCIA, type EstadoFrescura, type FrescuraPrenda, type FrescuraSede, type Sugerencia } from "./frescura-reglas";

// Las reglas de «Ya decidí» (ADR-0208, paso 4b). Las horas son de Lima (UTC−5) y el día de la decisión es el día 1: decidir un
// martes 29 de setiembre con 7 días vence el martes 6 de octubre a las 00:00 de Lima. Todo lo que dice «se vendió mejor» sale
// de números que se pueden hacer a mano: 28 unidad·días y 2 ventas contra 180 unidad·días y 3 ventas.

const DIA = 86_400;
const lima = (s: string) => `${s}-05:00`;
const AHORA = lima("2026-10-10T15:00:00");
const CREADA = lima("2026-09-29T14:00:00"); // un martes

/** Un renglón de la libreta (lo que devuelve la base). */
function r(p: Partial<RenglonCrudo> & { id: string }): RenglonCrudo {
  return {
    productoId: "prod-1",
    colorCodigo: "NEG",
    accion: "cambie_lugar",
    anteriorId: null,
    anteriorAccion: null,
    transferenciaId: null,
    nota: null,
    plazoDias: 7,
    creadoEn: CREADA,
    persona: "Ana Quispe",
    traslado: null,
    ventas: null,
    ...p,
  };
}

const ESTADO_QUIETA: EstadoFrescura = {
  tipo: "semaforo",
  tramo: "critica",
  alMenos: false,
  temporadaPasada: false,
  sinTemporada: false,
  quieta: true,
  sugerencias: ["cambiar_lugar", "trasladar"],
};

/** Una prenda de la sede (solo lo que las decisiones leen). */
function prenda(p: Partial<FrescuraPrenda> & { clave: string }): FrescuraPrenda {
  return {
    productoId: p.clave.split("|")[0],
    productoNombre: "Blusa",
    codigo: null,
    colorCodigo: p.clave.split("|")[1] ?? null,
    colorNombre: null,
    categoriaId: "blu",
    categoriaNombre: "Camisas y Blusas",
    tallas: [],
    pisoHoy: 3,
    almacenHoy: 0,
    apartadasHoy: 0,
    apartadasPisoHoy: 0,
    reloj: { segundos: 60 * DIA, alMenos: false },
    primeraExhibicion: lima("2026-07-01T12:00:00"),
    ultimaLlegada: lima("2026-07-01T12:00:00"),
    ultimaLlegadaCayla: lima("2026-07-01T12:00:00"),
    temporada: null,
    temporadaOrigen: null,
    esClasico: false,
    finEstacion: null,
    rapidez: null,
    ventasRecientes: 0,
    categoriaSinElla: null,
    estado: ESTADO_QUIETA,
    porDecidir: ESTADO_QUIETA.quieta,
    decision: null,
    ...p,
  };
}

/** Una `exposicion` con números fijos por prenda: unidad·días colgada y vendidas (no depende de la ventana). */
const fija =
  (tabla: Record<string, { u: number; v: number }>): ExposicionDe =>
  (clave) =>
    tabla[clave] ? { unidadSegundos: tabla[clave].u * DIA, vendidas: tabla[clave].v } : null;

function sedeCon(prendas: FrescuraPrenda[]): FrescuraSede {
  return {
    separaPiso: true,
    desde: lima("2026-06-10T00:00:00"),
    ahora: AHORA,
    categorias: [],
    prendas,
    cifras: { unidadesEnPiso: 0, edadDelPisoDias: null, edadDelPisoAlMenos: false, unidadesNuevas: 0, unidadesConTramo: 0, pctNuevas: null, porDecidir: 0, decididas: 0 },
    decisiones: { estado: "sin_lectura", aviso: "" },
  };
}
const lecturaCon = (renglones: RenglonCrudo[]): LecturaDecisiones => ({ ahora: AHORA, renglones, trasladosRecientes: [] });

// ---------------------------------------------------------------------------------------------------------------------
describe("la fecha en que vence: 00:00 de Lima, el día de la decisión es el día 1", () => {
  it("decidida un martes con 7 días vence el martes siguiente a las 00:00 de Lima (05:00 UTC)", () => {
    expect(finDePlazo(CREADA, 7)).toBe("2026-10-06T05:00:00.000Z");
  });

  it("a las 23:50 del mismo martes vence a la MISMA hora: no importa a qué hora del día se decidió", () => {
    expect(finDePlazo(lima("2026-09-29T23:50:00"), 7)).toBe("2026-10-06T05:00:00.000Z");
    expect(finDePlazo(lima("2026-09-29T00:01:00"), 7)).toBe("2026-10-06T05:00:00.000Z");
  });

  it("una decisión a las 19:30 de Lima (00:30 UTC del día siguiente) cuenta como del día de Lima, no del de UTC", () => {
    expect(finDePlazo("2026-09-30T00:30:00.000Z", 1)).toBe("2026-09-30T05:00:00.000Z");
  });

  it("cruza el fin de mes y de año sin desfase", () => {
    expect(finDePlazo(lima("2026-12-30T10:00:00"), 3)).toBe("2027-01-02T05:00:00.000Z");
  });
});

describe("cuántos días vale un compromiso: la rotación de su categoría, con tope", () => {
  const vara = (p50Dias: number | null, nivel: "solido" | "aceptable" | "pocos_datos" | null) => ({ cortes: { p50: p50Dias === null ? null : p50Dias * DIA, p75: null, p90: null }, nivel });

  it("con una comparación sólida en la sede: los días en que se vende la mitad («si en jeans es 15, 15 más»)", () => {
    expect(plazoDeCompromiso(vara(15, "solido"), undefined)).toBe(15);
    expect(plazoDeCompromiso(vara(10, "solido"), vara(20, "solido"))).toBe(10);
  });

  it("nunca pasa de 30 días", () => {
    expect(plazoDeCompromiso(vara(75, "solido"), undefined)).toBe(PLAZO_MAXIMO_DIAS);
  });

  it("sin comparación sólida en la sede usa la de CAYLA; sin ninguna, 15 días", () => {
    expect(plazoDeCompromiso(vara(12, "aceptable"), vara(20, "solido"))).toBe(20);
    expect(plazoDeCompromiso(vara(12, "pocos_datos"), null)).toBe(PLAZO_SIN_REFERENCIA_DIAS);
    expect(plazoDeCompromiso(undefined, undefined)).toBe(15);
    expect(plazoDeCompromiso(vara(null, "solido"), undefined)).toBe(15);
  });

  it("cambiarla de lugar son 7 días y trasladarla 14, pase lo que pase con la categoría", () => {
    expect(plazoDeAccion("cambie_lugar", vara(3, "solido"), undefined)).toBe(7);
    expect(plazoDeAccion("traslade", vara(3, "solido"), undefined)).toBe(14);
    expect(plazoDeAccion("hasta_agotar", vara(15, "solido"), undefined)).toBe(15);
    expect(plazoDeAccion("rebaje", undefined, undefined)).toBe(15);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("las libretas", () => {
  it("cada prenda tiene la suya y sus líneas salen en el orden de la cadena, no del reloj", () => {
    const a = r({ id: "a", creadoEn: lima("2026-09-29T14:00:00") });
    // Mismo segundo que `a`, pero responde a `a`: por el reloj no se sabría cuál va primero.
    const b = r({ id: "b", accion: "anulacion", anteriorId: "a", anteriorAccion: "cambie_lugar", plazoDias: null, creadoEn: lima("2026-09-29T14:00:00") });
    const otra = r({ id: "z", colorCodigo: "AZU", creadoEn: lima("2026-09-01T09:00:00") });
    const libretas = armarLibretas([b, otra, a]);
    expect([...libretas.keys()].sort()).toEqual(["prod-1|AZU", "prod-1|NEG"]);
    expect(libretas.get("prod-1|NEG")!.lineas.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("una línea vieja que quedó fuera de la lectura no rompe la libreta: empieza donde hay datos", () => {
    const x = r({ id: "x", anteriorId: "fuera-de-la-lectura", anteriorAccion: "cambie_lugar" });
    expect(armarLibretas([x]).get("prod-1|NEG")!.lineas.map((l) => l.id)).toEqual(["x"]);
  });

  it("si una libreta trae dos puntos de partida (una línea vieja quedó fuera de la lectura), va primero el más viejo", () => {
    const nueva = r({ id: "n", anteriorId: "fuera-2", anteriorAccion: "cambie_lugar", creadoEn: lima("2026-10-05T10:00:00") });
    const vieja = r({ id: "v", anteriorId: "fuera-1", anteriorAccion: "cambie_lugar", creadoEn: lima("2026-09-01T10:00:00") });
    expect(armarLibretas([nueva, vieja]).get("prod-1|NEG")!.lineas.map((l) => l.id)).toEqual(["v", "n"]);
  });

  it("un color nulo y uno vacío son la misma prenda (la clave que usa Frescura)", () => {
    const sin = r({ id: "s", colorCodigo: null });
    expect(armarLibretas([sin]).has("prod-1|")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("¿sigue valiendo? (terminaLinea)", () => {
  const sinNovedad = { ultimaLlegada: lima("2026-07-01T12:00:00"), finEstacion: null };

  it("cambiarla de lugar vale hasta las 00:00 de Lima del martes 6: a las 23:59 del lunes sigue, a las 00:00 ya no", () => {
    const l = r({ id: "a" });
    expect(terminaLinea(l, null, sinNovedad, lima("2026-10-05T23:59:00"))).toBeNull();
    expect(terminaLinea(l, null, sinNovedad, lima("2026-10-06T00:00:00"))).toEqual({ fin: "vencio", el: "2026-10-06T05:00:00.000Z" });
  });

  it("un compromiso de 15 días vale hasta el día 16", () => {
    const l = r({ id: "a", accion: "hasta_agotar", plazoDias: 15 });
    expect(terminaLinea(l, null, sinNovedad, lima("2026-10-13T12:00:00"))).toBeNull();
    expect(terminaLinea(l, null, sinNovedad, lima("2026-10-14T00:00:01"))).toMatchObject({ fin: "vencio" });
  });

  it("vuelve si LLEGA mercadería de ese modelo+color a la sede después de decidir", () => {
    const l = r({ id: "a", accion: "hasta_agotar", plazoDias: 15 });
    expect(terminaLinea(l, null, { ...sinNovedad, ultimaLlegada: lima("2026-10-02T09:00:00") }, AHORA)).toEqual({ fin: "llego_mercaderia", el: lima("2026-10-02T09:00:00") });
  });

  it("una llegada ANTERIOR a la decisión (o una bajada del almacén, que no es llegada) no la termina", () => {
    const l = r({ id: "a", accion: "hasta_agotar", plazoDias: 15 });
    expect(terminaLinea(l, null, { ...sinNovedad, ultimaLlegada: lima("2026-09-20T09:00:00") }, lima("2026-10-05T10:00:00"))).toBeNull();
  });

  it("vuelve si termina su temporada DESPUÉS de decidir; si ya había terminado antes, no", () => {
    const l = r({ id: "a", accion: "hasta_agotar", plazoDias: 15 });
    expect(terminaLinea(l, null, { ...sinNovedad, finEstacion: lima("2026-10-03T00:00:00") }, lima("2026-10-05T10:00:00"))).toEqual({ fin: "termino_temporada", el: lima("2026-10-03T00:00:00") });
    expect(terminaLinea(l, null, { ...sinNovedad, finEstacion: lima("2026-09-10T00:00:00") }, lima("2026-10-05T10:00:00"))).toBeNull();
    // Y una temporada que termina en el futuro todavía no cuenta.
    expect(terminaLinea(l, null, { ...sinNovedad, finEstacion: lima("2026-10-20T00:00:00") }, lima("2026-10-05T10:00:00"))).toBeNull();
  });

  it("«La trasladé» deja de valer si el traslado se anula", () => {
    const traslado = { numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "en_transito", anulado: false, recibidoEn: null, unidades: 3 };
    const l = r({ id: "a", accion: "traslade", plazoDias: 14, transferenciaId: "t", traslado });
    expect(terminaLinea(l, null, sinNovedad, lima("2026-10-03T10:00:00"))).toBeNull();
    expect(terminaLinea({ ...l, traslado: { ...traslado, anulado: true } }, null, sinNovedad, lima("2026-10-03T10:00:00"))).toMatchObject({ fin: "traslado_anulado" });
  });

  it("otra línea encima la termina: una anulación («quitaste lo anotado») o una decisión nueva («la cambiaste»)", () => {
    const l = r({ id: "a" });
    expect(terminaLinea(l, r({ id: "b", accion: "anulacion", creadoEn: lima("2026-09-30T09:00:00") }), sinNovedad, AHORA)).toEqual({ fin: "anulada", el: lima("2026-09-30T09:00:00") });
    expect(terminaLinea(l, r({ id: "b", accion: "hasta_agotar", creadoEn: lima("2026-09-30T09:00:00") }), sinNovedad, AHORA)).toEqual({ fin: "cambiada", el: lima("2026-09-30T09:00:00") });
  });

  it("una anulación es, ella misma, algo terminado", () => {
    expect(terminaLinea(r({ id: "b", accion: "anulacion", plazoDias: null }), null, sinNovedad, AHORA)).toMatchObject({ fin: "anulada" });
  });

  it("si pasaron varias cosas, manda la que pasó PRIMERO", () => {
    const l = r({ id: "a", accion: "hasta_agotar", plazoDias: 3 }); // vence el 2 de octubre a las 00:00
    const fin = terminaLinea(l, null, { ultimaLlegada: lima("2026-10-01T09:00:00"), finEstacion: lima("2026-10-05T00:00:00") }, AHORA);
    expect(fin).toEqual({ fin: "llego_mercaderia", el: lima("2026-10-01T09:00:00") });
  });

  it("pasar de Vigente a Envejecida o a Crítica NO la termina: es el reloj que avanza y quien decidió ya lo sabía", () => {
    const sede = sedeCon([prenda({ clave: "prod-1|NEG", estado: { ...ESTADO_QUIETA, tramo: "critica" } })]);
    aplicarDecisiones(sede, lecturaCon([r({ id: "a", accion: "hasta_agotar", plazoDias: 15, creadoEn: lima("2026-10-05T10:00:00") })]), fija({}), AHORA);
    expect(sede.prendas[0].decision?.vigente).toBe(true);
    expect(sede.prendas[0].porDecidir).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("«Por decidir» es quieta y sin decisión vigente: UN solo lugar lo dice", () => {
  const quieta = (clave: string, extra: Partial<FrescuraPrenda> = {}) => prenda({ clave, ...extra });
  const noQuieta = (clave: string) => prenda({ clave, estado: { ...ESTADO_QUIETA, quieta: false, sugerencias: [] }, porDecidir: false });

  it("sin nada anotado, lo quieto sigue por decidir", () => {
    const sede = sedeCon([quieta("prod-1|NEG"), noQuieta("prod-2|NEG")]);
    aplicarDecisiones(sede, lecturaCon([]), fija({}), AHORA);
    expect(sede.prendas.map((p) => p.porDecidir)).toEqual([true, false]);
    expect(sede.cifras).toMatchObject({ porDecidir: 1, decididas: 0 });
    expect(sede.prendas[0].decision).toBeNull();
  });

  it("con una decisión vigente sale de «Por decidir» y cuenta entre las decididas", () => {
    const sede = sedeCon([quieta("prod-1|NEG"), quieta("prod-2|NEG")]);
    const lectura = lecturaCon([r({ id: "a", creadoEn: lima("2026-10-08T10:00:00") })]);
    const estado = aplicarDecisiones(sede, lectura, fija({}), AHORA);
    expect(sede.prendas.map((p) => p.porDecidir)).toEqual([false, true]);
    expect(sede.cifras).toMatchObject({ porDecidir: 1, decididas: 1 });
    expect(sede.prendas[0].decision).toMatchObject({ vigente: true, actual: { id: "a", accion: "cambie_lugar", fin: null, vence: "2026-10-15T05:00:00.000Z" } });
    expect(estado.estado).toBe("ok");
  });

  it("«decididas» cuenta también lo que ya no está quieto (una decisión vigente sobre una prenda que se vende)", () => {
    const sede = sedeCon([noQuieta("prod-1|NEG")]);
    aplicarDecisiones(sede, lecturaCon([r({ id: "a", accion: "hasta_agotar", plazoDias: 15, creadoEn: lima("2026-10-08T10:00:00") })]), fija({}), AHORA);
    expect(sede.cifras).toMatchObject({ porDecidir: 0, decididas: 1 });
    expect(sede.prendas[0].porDecidir).toBe(false);
  });

  it("al vencer vuelve a «Por decidir» SOLO si sigue quieta; si ya se vende, no aparece", () => {
    const vieja = r({ id: "a", creadoEn: lima("2026-09-20T10:00:00") }); // 7 días: venció el 27
    const sede = sedeCon([quieta("prod-1|NEG"), noQuieta("prod-2|NEG")]);
    aplicarDecisiones(sede, lecturaCon([vieja, r({ id: "b", productoId: "prod-2", creadoEn: lima("2026-09-20T10:00:00") })]), fija({}), AHORA);
    expect(sede.prendas.map((p) => p.porDecidir)).toEqual([true, false]);
    expect(sede.prendas[0].decision).toMatchObject({ vigente: false, actual: { fin: "vencio", finEl: "2026-09-27T05:00:00.000Z" } });
  });

  it("quitar lo anotado (una anulación encima) la devuelve a «Por decidir»", () => {
    const sede = sedeCon([quieta("prod-1|NEG")]);
    const a = r({ id: "a", creadoEn: lima("2026-10-08T10:00:00") });
    const b = r({ id: "b", accion: "anulacion", plazoDias: null, anteriorId: "a", anteriorAccion: "cambie_lugar", creadoEn: lima("2026-10-08T10:00:10") });
    aplicarDecisiones(sede, lecturaCon([a, b]), fija({}), AHORA);
    expect(sede.prendas[0].porDecidir).toBe(true);
    expect(sede.prendas[0].decision).toMatchObject({ vigente: false, actual: { id: "b", accion: "anulacion" }, historia: [{ id: "a", fin: "anulada" }] });
    expect(sede.cifras.decididas).toBe(0);
  });

  it("cambiar de opinión: la anterior queda «cambiada» y la nueva es la vigente", () => {
    const sede = sedeCon([quieta("prod-1|NEG")]);
    const a = r({ id: "a", creadoEn: lima("2026-10-08T10:00:00") });
    const b = r({ id: "b", accion: "hasta_agotar", plazoDias: 15, anteriorId: "a", anteriorAccion: "cambie_lugar", creadoEn: lima("2026-10-09T10:00:00") });
    aplicarDecisiones(sede, lecturaCon([a, b]), fija({}), AHORA);
    expect(sede.prendas[0].decision).toMatchObject({ vigente: true, actual: { id: "b" }, historia: [{ id: "a", fin: "cambiada" }] });
  });

  it("caída externa: sin la lectura de lo decidido, «Por decidir» es «quieta» (más prendas, nunca menos) y la sede lo dice", () => {
    const sede = sedeCon([quieta("prod-1|NEG"), noQuieta("prod-2|NEG")]);
    const estado = aplicarDecisiones(sede, null, fija({}), AHORA);
    expect(estado.estado).toBe("sin_lectura");
    if (estado.estado === "sin_lectura") expect(estado.aviso).toMatch(/No se pudo leer lo ya decidido/);
    expect(sede.prendas.map((p) => p.porDecidir)).toEqual([true, false]);
    expect(sede.cifras).toMatchObject({ porDecidir: 1, decididas: 0 });
  });

  it("la lectura tolera renglones de prendas que ya no están en la sede", () => {
    const sede = sedeCon([quieta("prod-1|NEG")]);
    expect(() => aplicarDecisiones(sede, lecturaCon([r({ id: "x", productoId: "no-esta" })]), fija({}), AHORA)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("«¿sirvió?»: ventas por unidad·día colgada contra las demás de su categoría", () => {
  const P = { clave: "prod-1|NEG", categoriaId: "blu" };
  const V = { desde: lima("2026-09-29T14:00:00"), hasta: lima("2026-10-06T00:00:00") };
  const resto = (n: number) => Array.from({ length: n }, (_, i) => prenda({ clave: `otra-${i}|NEG` }));
  const contexto = (tabla: Record<string, { u: number; v: number }>, prendas: FrescuraPrenda[], inter = new Map<string, { desde: number; hasta: number }[]>()): ContextoDeMedicion => ({
    prendas: [prenda(P), ...prendas],
    exposicion: fija(tabla),
    intervenciones: inter,
  });

  it("el caso de la Blusa Wayra: 28 unidad·días y 2 ventas contra 180 y 3 → sirvió, se esperaban 0.47", () => {
    const c = contexto({ "prod-1|NEG": { u: 28, v: 2 }, "otra-0|NEG": { u: 100, v: 2 }, "otra-1|NEG": { u: 80, v: 1 } }, resto(2));
    expect(medirVentana(P, V, c)).toMatchObject({ veredicto: "sirvio", suyas: 2, esperadas: 0.47, ventasDelControl: 3, prendasDeControl: 2 });
  });

  it("vendió menos que el ritmo de las demás → no alcanzó", () => {
    const c = contexto({ "prod-1|NEG": { u: 28, v: 0 }, "otra-0|NEG": { u: 100, v: 10 }, "otra-1|NEG": { u: 80, v: 8 } }, resto(2));
    expect(medirVentana(P, V, c)).toMatchObject({ veredicto: "no_alcanzo", suyas: 0, esperadas: 2.8 }); // 28 × 18 ÷ 180
  });

  it("0 vendidas con 0.47 esperadas → aún no se sabe (con esa evidencia no se afirma nada)", () => {
    const c = contexto({ "prod-1|NEG": { u: 28, v: 0 }, "otra-0|NEG": { u: 100, v: 2 }, "otra-1|NEG": { u: 80, v: 1 } }, resto(2));
    const m = medirVentana(P, V, c);
    expect(m.veredicto).toBe("aun_no_se_sabe");
    expect(m.suyas + m.esperadas).toBeLessThan(EVIDENCIA_MINIMA);
  });

  it("vender EXACTAMENTE al ritmo de las demás cuenta como «sirvió» (igual o mejor, no solo mejor)", () => {
    // 28 unidad·días y 2 ventas; las demás, 140 y 10: la misma tasa (1 cada 14).
    const c = contexto({ "prod-1|NEG": { u: 28, v: 2 }, "otra-0|NEG": { u: 140, v: 10 } }, resto(1));
    expect(medirVentana(P, V, c)).toMatchObject({ veredicto: "sirvio", suyas: 2, esperadas: 2 });
  });

  it("la categoría no vendió NADA y ella sí → sirvió, sin caso especial", () => {
    const c = contexto({ "prod-1|NEG": { u: 28, v: 1 }, "otra-0|NEG": { u: 100, v: 0 } }, resto(1));
    expect(medirVentana(P, V, c)).toMatchObject({ veredicto: "sirvio", esperadas: 0 });
  });

  it("la categoría no vendió nada y ella tampoco → aún no se sabe", () => {
    const c = contexto({ "prod-1|NEG": { u: 28, v: 0 }, "otra-0|NEG": { u: 100, v: 0 } }, resto(1));
    expect(medirVentana(P, V, c).veredicto).toBe("aun_no_se_sabe");
  });

  it("sin otras prendas colgadas esos días → sin con qué compararla; sin haber estado colgada → no estuvo colgada", () => {
    expect(medirVentana(P, V, contexto({ "prod-1|NEG": { u: 28, v: 2 } }, resto(1))).veredicto).toBe("sin_control");
    expect(medirVentana(P, V, contexto({ "prod-1|NEG": { u: 0, v: 0 }, "otra-0|NEG": { u: 100, v: 3 } }, resto(1))).veredicto).toBe("no_estuvo_colgada");
    expect(medirVentana(P, V, contexto({ "otra-0|NEG": { u: 100, v: 3 } }, resto(1))).veredicto).toBe("no_estuvo_colgada"); // la exposición no la conoce (clásica o no cuadra)
  });

  it("el control deja fuera a la prenda misma, a los clásicos, a las que no cuadran y a otra categoría", () => {
    const otras = [
      prenda({ clave: "cla|NEG", esClasico: true }),
      prenda({ clave: "dud|NEG", estado: { ...ESTADO_QUIETA, tipo: "dudosa" } as unknown as EstadoFrescura }),
      prenda({ clave: "jean|NEG", categoriaId: "jeans" }),
      prenda({ clave: "buena|NEG" }),
    ];
    const tabla = { "prod-1|NEG": { u: 20, v: 1 }, "cla|NEG": { u: 999, v: 99 }, "dud|NEG": { u: 999, v: 99 }, "jean|NEG": { u: 999, v: 99 }, "buena|NEG": { u: 50, v: 1 } };
    expect(medirVentana(P, V, contexto(tabla, otras))).toMatchObject({ prendasDeControl: 1, ventasDelControl: 1 });
  });

  it("la novedad colgada por primera vez DENTRO de la ventana no es control (la novedad vende por nueva)", () => {
    const nueva = prenda({ clave: "nueva|NEG", primeraExhibicion: lima("2026-10-01T10:00:00") });
    const vieja = prenda({ clave: "vieja|NEG", primeraExhibicion: lima("2026-08-01T10:00:00") });
    const tabla = { "prod-1|NEG": { u: 20, v: 1 }, "nueva|NEG": { u: 30, v: 9 }, "vieja|NEG": { u: 50, v: 1 } };
    expect(medirVentana(P, V, contexto(tabla, [nueva, vieja]))).toMatchObject({ prendasDeControl: 1, ventasDelControl: 1 });
  });

  it("si el líder cambia de lugar 5 blusas el mismo día, cada una no es el control de las otras", () => {
    // Las 5 blusas se movieron el martes 29 con su decisión de 7 días.
    const claves = [0, 1, 2, 3, 4].map((i) => `blusa-${i}|NEG`);
    const libretas = armarLibretas(claves.map((k, i) => r({ id: `d${i}`, productoId: k.split("|")[0] })));
    const inter = intervenciones(libretas, AHORA);
    const todas = claves.map((k) => prenda({ clave: k }));
    const solo = prenda({ clave: "quieta|NEG" });
    const tabla = Object.fromEntries([...claves.map((k) => [k, { u: 30, v: 2 }]), ["quieta|NEG", { u: 40, v: 5 }]]);
    const c: ContextoDeMedicion = { prendas: [...todas, solo], exposicion: fija(tabla), intervenciones: inter };
    // La blusa 0 se mide contra las que NO se movieron: solo «quieta», no las otras 4 blusas.
    expect(medirVentana({ clave: claves[0], categoriaId: "blu" }, V, c)).toMatchObject({ prendasDeControl: 1, ventasDelControl: 5 });
    // Con las intervenciones sin considerar, las otras 4 entrarían al control.
    expect(medirVentana({ clave: claves[0], categoriaId: "blu" }, V, { ...c, intervenciones: new Map() }).prendasDeControl).toBe(5);
  });

  it("«La dejo hasta agotar» no mueve nada: no saca a la prenda del control de otras", () => {
    const libretas = armarLibretas([r({ id: "a", productoId: "otra-0", accion: "hasta_agotar", plazoDias: 15 })]);
    expect(intervenciones(libretas, AHORA).has("otra-0|NEG")).toBe(false);
  });

  it("una decisión que se quitó después no cuenta como intervención", () => {
    const a = r({ id: "a", productoId: "otra-0" });
    const b = r({ id: "b", productoId: "otra-0", accion: "anulacion", plazoDias: null, anteriorId: "a", anteriorAccion: "cambie_lugar" });
    expect(intervenciones(armarLibretas([a, b]), AHORA).has("otra-0|NEG")).toBe(false);
  });

  it("la evidencia mínima es la misma que la de la rapidez", () => {
    expect(EVIDENCIA_MINIMA).toBe(RAPIDEZ_MIN_EVIDENCIA);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el nivel del piso a lo largo del tiempo (exposicionDeEventos)", () => {
  const ev = (ts: string, delta: number, esVenta = false): EventoPiso => ({ ts: lima(ts), delta, esVenta, esMovimientoInterno: !esVenta });

  it("3 unidades toda la ventana y una venta a mitad: 3×½ + 2×½ = 2.5 unidad·días, 1 vendida", () => {
    const e = [ev("2026-09-01T00:00:00", 3), ev("2026-10-03T00:00:00", -1, true)];
    const x = exposicionDeEventos(e, lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00"));
    expect(x.vendidas).toBe(1);
    expect(x.unidadSegundos / DIA).toBeCloseTo(3 * 2 + 2 * 2, 6);
  });

  it("lo que sale del piso sin venderse (un retiro) baja el nivel pero no cuenta como venta", () => {
    const e = [ev("2026-09-01T00:00:00", 4), ev("2026-10-02T00:00:00", -4, false)];
    const x = exposicionDeEventos(e, lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00"));
    expect(x).toEqual({ unidadSegundos: 4 * DIA, vendidas: 0 });
  });

  it("lo apartado para una clienta, que la lectura ya trae como venta, cuenta como venta (y baja lo libre)", () => {
    const e = [ev("2026-09-01T00:00:00", 2), ev("2026-10-02T12:00:00", -1, true)];
    expect(exposicionDeEventos(e, lima("2026-10-02T00:00:00"), lima("2026-10-03T00:00:00")).vendidas).toBe(1);
  });

  it("el borde final queda afuera, el inicial adentro; sin ventana no hay nada", () => {
    const e = [ev("2026-09-01T00:00:00", 2), ev("2026-10-05T00:00:00", -2, true)];
    expect(exposicionDeEventos(e, lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00")).vendidas).toBe(0);
    expect(exposicionDeEventos(e, lima("2026-10-05T00:00:00"), lima("2026-10-06T00:00:00")).vendidas).toBe(2);
    expect(exposicionDeEventos(e, lima("2026-10-05T00:00:00"), lima("2026-10-05T00:00:00"))).toEqual({ unidadSegundos: 0, vendidas: 0 });
  });

  it("un nivel negativo (un libro que no cuadra) nunca resta exposición, ni antes ni dentro de la ventana", () => {
    const x = exposicionDeEventos([ev("2026-09-30T00:00:00", -2, true)], lima("2026-10-01T00:00:00"), lima("2026-10-02T00:00:00"));
    expect(x.unidadSegundos).toBe(0);
    // Dentro de la ventana: llega 1 con el nivel en −2 (queda en −1, sin nada colgado) y dos días después llegan 3 (queda en 2).
    const y = exposicionDeEventos([ev("2026-09-30T00:00:00", -2, true), ev("2026-10-01T00:00:00", 1), ev("2026-10-03T00:00:00", 3)], lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00"));
    expect(y.unidadSegundos / DIA).toBeCloseTo(2 * 2, 6);
  });

  it("no depende del orden en que llegan", () => {
    const e = [ev("2026-10-03T00:00:00", -1, true), ev("2026-09-01T00:00:00", 3)];
    expect(exposicionDeEventos(e, lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00")).vendidas).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("la ventana en que se mide, y qué la acorta", () => {
  const sin = { ultimaLlegada: lima("2026-07-01T12:00:00"), finEstacion: null };

  it("una prueba de 7 días corre hasta su fecha; mientras no llega, va «en curso» hasta ahora", () => {
    const l = r({ id: "a" });
    expect(ventanaDeLinea(l, null, sin, lima("2026-10-02T10:00:00"))).toMatchObject({ desde: CREADA, hasta: lima("2026-10-02T10:00:00"), enCurso: true, cortadaPor: null });
    expect(ventanaDeLinea(l, null, sin, AHORA)).toMatchObject({ hasta: "2026-10-06T05:00:00.000Z", enCurso: false, cortadaPor: null });
  });

  it("una llegada de mercadería la corta ese día, y lo dice", () => {
    const v = ventanaDeLinea(r({ id: "a" }), null, { ...sin, ultimaLlegada: lima("2026-10-01T09:00:00") }, AHORA);
    expect(v).toMatchObject({ hasta: lima("2026-10-01T09:00:00"), enCurso: false, cortadaPor: "llegada" });
  });

  it("el fin de su temporada la corta; otra decisión encima también", () => {
    expect(ventanaDeLinea(r({ id: "a" }), null, { ...sin, finEstacion: lima("2026-10-03T00:00:00") }, AHORA)?.cortadaPor).toBe("temporada");
    expect(ventanaDeLinea(r({ id: "a" }), r({ id: "b", creadoEn: lima("2026-10-02T09:00:00") }), sin, AHORA)).toMatchObject({ hasta: lima("2026-10-02T09:00:00"), cortadaPor: "otra_decision" });
  });

  it("quitar lo anotado no se mide: una anulación no tiene ventana", () => {
    expect(ventanaDeLinea(r({ id: "b", accion: "anulacion", plazoDias: null }), null, sin, AHORA)).toBeNull();
  });

  it("«La trasladé» se mide desde que el traslado ENTRÓ al destino, 7 días", () => {
    const traslado = { numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "completada", anulado: false, recibidoEn: lima("2026-10-01T10:00:00"), unidades: 3 };
    const v = ventanaDeLinea(r({ id: "a", accion: "traslade", plazoDias: 14, traslado }), null, sin, AHORA);
    expect(v).toMatchObject({ desde: lima("2026-10-01T10:00:00"), hasta: "2026-10-08T05:00:00.000Z" });
  });

  it("«La trasladé» que todavía no llega: aún no llega, sin medir nada", () => {
    const traslado = { numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "en_transito", anulado: false, recibidoEn: null, unidades: 3 };
    expect(ventanaDeLinea(r({ id: "a", accion: "traslade", plazoDias: 14, traslado }), null, sin, AHORA)).toBeNull();
    const m = medirLinea(r({ id: "a", accion: "traslade", plazoDias: 14, traslado }), null, { clave: "prod-1|NEG", categoriaId: "blu", ...sin }, AHORA, { prendas: [], exposicion: fija({}), intervenciones: new Map() });
    expect(m?.veredicto).toBe("aun_no_llega");
  });

  it("«La trasladé» vista desde el origen dice que se mide en el destino, con su nombre", () => {
    const traslado = { numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "completada", anulado: false, recibidoEn: lima("2026-10-01T10:00:00"), unidades: 3 };
    const m = medirLinea(r({ id: "a", accion: "traslade", plazoDias: 14, traslado }), null, { clave: "prod-1|NEG", categoriaId: "blu", ...sin }, AHORA, { prendas: [], exposicion: fija({}), intervenciones: new Map() });
    expect(m).toMatchObject({ veredicto: "se_mide_en_destino", enSede: "Tienda Lima" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("«La rebajé»: una campaña no es una liquidación", () => {
  const v = (ts: string, cantidad: number, motivo: string | null) => ({ ts: lima(ts), cantidad, motivo });

  it("separa lo vendido con descuento de liquidación, de campaña y sin descuento", () => {
    const ventas = [v("2026-10-01T10:00:00", 1, null), v("2026-10-02T10:00:00", 2, "campana"), v("2026-10-03T10:00:00", 1, "liquidacion_temporada"), v("2026-10-03T11:00:00", 1, "cerrar_venta"), v("2026-10-04T10:00:00", 1, "cumpleanos_clienta_top")];
    expect(desgloseDeRebaje(ventas, lima("2026-10-01T00:00:00"), lima("2026-10-10T00:00:00"))).toEqual({ conLiquidacion: 2, deCampana: 3, sinDescuento: 1 });
  });

  it("solo cuenta lo de la ventana", () => {
    const ventas = [v("2026-09-30T10:00:00", 5, null), v("2026-10-02T10:00:00", 1, null), v("2026-10-09T10:00:00", 7, null)];
    expect(desgloseDeRebaje(ventas, lima("2026-10-01T00:00:00"), lima("2026-10-05T00:00:00"))).toEqual({ conLiquidacion: 0, deCampana: 0, sinDescuento: 1 });
  });

  it("la línea de «La rebajé» lo lleva en su resultado", () => {
    const l = r({ id: "a", accion: "rebaje", plazoDias: 15, ventas: [v("2026-09-30T10:00:00", 1, "campana")] });
    const m = medirLinea(l, null, { clave: "prod-1|NEG", categoriaId: "blu", ultimaLlegada: lima("2026-07-01T12:00:00"), finEstacion: null }, AHORA, {
      prendas: [prenda({ clave: "prod-1|NEG" }), prenda({ clave: "otra|NEG" })],
      exposicion: fija({ "prod-1|NEG": { u: 30, v: 1 }, "otra|NEG": { u: 30, v: 1 } }),
      intervenciones: new Map(),
    });
    expect(m?.rebaje).toEqual({ conLiquidacion: 0, deCampana: 1, sinDescuento: 0 });
    expect(medirLinea(r({ id: "b" }), null, { clave: "x|NEG", categoriaId: "blu", ultimaLlegada: null, finEstacion: null }, AHORA, { prendas: [], exposicion: fija({ "x|NEG": { u: 1, v: 0 } }), intervenciones: new Map() })?.rebaje).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("qué se sugiere después: la escalera sigue, no da vueltas", () => {
  const resultado = (veredicto: Resultado["veredicto"], enCurso = false): Resultado => ({
    veredicto, desde: CREADA, hasta: AHORA, enCurso, cortadaPor: null, suyas: 0, esperadas: 1.6, ventasDelControl: 3, prendasDeControl: 2, rebaje: null, enSede: null,
  });
  const base: Sugerencia[] = ["cambiar_lugar", "trasladar"];
  const ultima = (veredicto: Resultado["veredicto"], finEl = lima("2026-10-06T00:00:00")) => ({ accion: "cambie_lugar" as const, resultado: resultado(veredicto), finEl });

  it("sin haber decidido nada, las sugerencias son las de siempre", () => {
    expect(sugerenciasConHistoria(base, true, null, AHORA)).toEqual(base);
  });

  it("cambiarla de lugar SIRVIÓ → «¿la dejas ahí hasta agotar?» en vez de volver a moverla", () => {
    expect(sugerenciasConHistoria(base, true, ultima("sirvio"), AHORA)).toEqual(["dejar_hasta_agotar", "trasladar"]);
  });

  it("NO alcanzó → «cambiar de lugar» no se vuelve a sugerir en 30 días; sigue trasladar si se puede", () => {
    expect(sugerenciasConHistoria(base, true, ultima("no_alcanzo"), AHORA)).toEqual(["trasladar"]);
  });

  it("NO alcanzó y no se puede trasladar → el siguiente escalón como texto (la rebaja chica del líder): nunca queda sin pista", () => {
    expect(sugerenciasConHistoria(["cambiar_lugar"], true, ultima("no_alcanzo"), AHORA)).toEqual(["rebaja_chica"]);
    expect(sugerenciasConHistoria(["cambiar_lugar", "revisar_ventas"], true, ultima("no_alcanzo"), AHORA)).toEqual(["revisar_ventas", "rebaja_chica"]);
  });

  it("pasados 30 días del fracaso, «cambiar de lugar» puede volver", () => {
    expect(sugerenciasConHistoria(base, true, ultima("no_alcanzo", lima("2026-09-01T00:00:00")), AHORA)).toEqual(base);
  });

  it("aún no se sabe / sin con qué compararla → las de siempre (la pantalla dice que la prueba no dijo nada)", () => {
    expect(sugerenciasConHistoria(base, true, ultima("aun_no_se_sabe"), AHORA)).toEqual(base);
    expect(sugerenciasConHistoria(base, true, ultima("sin_control"), AHORA)).toEqual(base);
  });

  it("una prueba que sigue en curso, o de otra acción, no cambia nada; y lo que no está quieto tampoco", () => {
    expect(sugerenciasConHistoria(base, true, { accion: "cambie_lugar", resultado: resultado("no_alcanzo", true), finEl: null }, AHORA)).toEqual(base);
    expect(sugerenciasConHistoria(base, true, { accion: "hasta_agotar", resultado: resultado("no_alcanzo"), finEl: AHORA }, AHORA)).toEqual(base);
    expect(sugerenciasConHistoria([], false, ultima("no_alcanzo"), AHORA)).toEqual([]);
  });

  it("de punta a punta: una prueba que no alcanzó, ya terminada, cambia lo que ve la prenda que vuelve a «Por decidir»", () => {
    const p = prenda({ clave: "prod-1|NEG" });
    const otra = prenda({ clave: "otra|NEG" });
    const sede = sedeCon([p, otra]);
    // Ella colgada 28 unidad·días sin vender; la otra 180 con 10 ventas: no alcanzó.
    aplicarDecisiones(sede, lecturaCon([r({ id: "a", creadoEn: lima("2026-09-20T10:00:00") })]), fija({ "prod-1|NEG": { u: 28, v: 0 }, "otra|NEG": { u: 180, v: 10 } }), AHORA);
    expect(sede.prendas[0].porDecidir).toBe(true);
    expect(sede.prendas[0].decision?.actual.resultado?.veredicto).toBe("no_alcanzo");
    expect(sede.prendas[0].estado.sugerencias).toEqual(["trasladar"]);
    expect(sede.prendas[0].estado.sugerencias.length).toBeGreaterThan(0);
  });

  it("ninguna prenda quieta queda sin sugerencias, con cualquier resultado", () => {
    for (const v of ["sirvio", "no_alcanzo", "aun_no_se_sabe", "sin_control", "no_estuvo_colgada"] as const) {
      for (const b of [["cambiar_lugar"], ["cambiar_lugar", "trasladar"], ["revisar_ventas"]] as Sugerencia[][]) {
        expect(sugerenciasConHistoria(b, true, ultima(v), AHORA).length, `${v} ${b}`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el resumen del mes por acción", () => {
  it("suma las decisiones que TERMINARON en los últimos 30 días, con la misma regla de evidencia", () => {
    const p1 = prenda({ clave: "prod-1|NEG" });
    const p2 = prenda({ clave: "prod-2|NEG" });
    const otra = prenda({ clave: "otra|NEG" });
    const sede = sedeCon([p1, p2, otra]);
    const lectura = lecturaCon([r({ id: "a", creadoEn: lima("2026-09-20T10:00:00") }), r({ id: "b", productoId: "prod-2", creadoEn: lima("2026-09-20T10:00:00") })]);
    const est = aplicarDecisiones(sede, lectura, fija({ "prod-1|NEG": { u: 28, v: 2 }, "prod-2|NEG": { u: 28, v: 0 }, "otra|NEG": { u: 180, v: 3 } }), AHORA);
    expect(est.estado).toBe("ok");
    if (est.estado !== "ok") return;
    expect(est.resumen.cambie_lugar).toMatchObject({ terminadas: 2, sirvieron: 1, aunNoSeSabe: 1, noAlcanzaron: 0, suyas: 2 });
    expect(est.resumen.cambie_lugar.esperadas).toBeCloseTo(0.47 * 2, 1);
  });

  it("una decisión que terminó hace más de 30 días ya no es «este mes»", () => {
    const sede = sedeCon([prenda({ clave: "prod-1|NEG" }), prenda({ clave: "otra|NEG" })]);
    const vieja = r({ id: "a", creadoEn: lima("2026-08-20T10:00:00") }); // terminó el 27 de agosto
    const est = aplicarDecisiones(sede, lecturaCon([vieja]), fija({ "prod-1|NEG": { u: 28, v: 2 }, "otra|NEG": { u: 180, v: 3 } }), AHORA);
    if (est.estado === "ok") expect(est.resumen.cambie_lugar.terminadas).toBe(0);
    // Una que terminó hace poco sí cuenta.
    const sede2 = sedeCon([prenda({ clave: "prod-1|NEG" }), prenda({ clave: "otra|NEG" })]);
    const reciente = r({ id: "a", creadoEn: lima("2026-09-20T10:00:00") }); // terminó el 27 de setiembre
    const est2 = aplicarDecisiones(sede2, lecturaCon([reciente]), fija({ "prod-1|NEG": { u: 28, v: 2 }, "otra|NEG": { u: 180, v: 3 } }), AHORA);
    if (est2.estado === "ok") expect(est2.resumen.cambie_lugar.terminadas).toBe(1);
  });

  it("sumarAlResumen no cuenta lo que sigue en curso, ni una anulación, ni un veredicto sin cifra", () => {
    const cero = { terminadas: 0, sirvieron: 0, noAlcanzaron: 0, aunNoSeSabe: 0, suyas: 0, esperadas: 0 };
    const resumen = { cambie_lugar: { ...cero }, hasta_agotar: { ...cero }, traslade: { ...cero }, rebaje: { ...cero } };
    const base: Resultado = { veredicto: "sirvio", desde: CREADA, hasta: AHORA, enCurso: false, cortadaPor: null, suyas: 2, esperadas: 1, ventasDelControl: 3, prendasDeControl: 2, rebaje: null, enSede: null };
    sumarAlResumen(resumen, "cambie_lugar", { ...base, enCurso: true });
    sumarAlResumen(resumen, "anulacion", base);
    sumarAlResumen(resumen, "cambie_lugar", { ...base, veredicto: "sin_control" });
    expect(resumen.cambie_lugar.terminadas).toBe(0);
    sumarAlResumen(resumen, "cambie_lugar", base);
    expect(resumen.cambie_lugar).toMatchObject({ terminadas: 1, sirvieron: 1, suyas: 2, esperadas: 1 });
  });

  it("lo que sigue en curso no se suma", () => {
    const sede = sedeCon([prenda({ clave: "prod-1|NEG" }), prenda({ clave: "otra|NEG" })]);
    const est = aplicarDecisiones(sede, lecturaCon([r({ id: "a", creadoEn: lima("2026-10-09T10:00:00") })]), fija({ "prod-1|NEG": { u: 2, v: 0 }, "otra|NEG": { u: 10, v: 3 } }), AHORA);
    if (est.estado === "ok") expect(est.resumen.cambie_lugar.terminadas).toBe(0);
  });

  it("todas las acciones existen en el resumen aunque no haya nada", () => {
    const est = aplicarDecisiones(sedeCon([]), lecturaCon([]), fija({}), AHORA);
    if (est.estado === "ok") expect(Object.keys(est.resumen).sort()).toEqual([...ACCIONES_DECISION].sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("«La trasladé» medida en la tienda destino (solo el líder, que las lee todas)", () => {
  it("toma su veredicto de la lectura de la tienda destino: 7 días desde que entró, contra las demás de su categoría allá", () => {
    const traslado = { numero: 5, destinoId: "lima", destino: "Tienda Lima", estado: "completada", anulado: false, recibidoEn: lima("2026-10-01T10:00:00"), unidades: 3 };
    const linea = r({ id: "a", accion: "traslade", plazoDias: 14, transferenciaId: "t", traslado, creadoEn: lima("2026-09-30T10:00:00") });
    const origen = sedeCon([prenda({ clave: "prod-1|NEG" })]);
    const lecturaOrigen = lecturaCon([linea]);
    const decOrigen = aplicarDecisiones(origen, lecturaOrigen, fija({}), AHORA);
    expect(origen.prendas[0].decision?.actual.resultado?.veredicto).toBe("se_mide_en_destino");

    // En Lima, la misma prenda se vendió bien (5 en 40 unidad·días) contra las demás (2 en 200).
    const destino = sedeCon([prenda({ clave: "prod-1|NEG" }), prenda({ clave: "otra|NEG" })]);
    const decDestino = aplicarDecisiones(destino, lecturaCon([]), fija({ "prod-1|NEG": { u: 40, v: 5 }, "otra|NEG": { u: 200, v: 2 } }), AHORA);
    completarTraslados(
      [
        { id: "tru", nombre: "Tienda Trujillo", sede: origen, decisiones: decOrigen, lectura: lecturaOrigen, exposicion: fija({}) },
        { id: "lima", nombre: "Tienda Lima", sede: destino, decisiones: decDestino, lectura: lecturaCon([]), exposicion: fija({ "prod-1|NEG": { u: 40, v: 5 }, "otra|NEG": { u: 200, v: 2 } }) },
      ],
      AHORA,
    );
    expect(origen.prendas[0].decision?.actual.resultado).toMatchObject({ veredicto: "sirvio", enSede: "Tienda Lima", suyas: 5 });
  });

  it("si el destino no se pudo leer, sigue diciendo que se mide allá", () => {
    const traslado = { numero: 5, destinoId: "lima", destino: "Tienda Lima", estado: "completada", anulado: false, recibidoEn: lima("2026-10-01T10:00:00"), unidades: 3 };
    const origen = sedeCon([prenda({ clave: "prod-1|NEG" })]);
    const lect = lecturaCon([r({ id: "a", accion: "traslade", plazoDias: 14, transferenciaId: "t", traslado })]);
    const dec = aplicarDecisiones(origen, lect, fija({}), AHORA);
    completarTraslados([{ id: "tru", nombre: "Tienda Trujillo", sede: origen, decisiones: dec, lectura: lect, exposicion: fija({}) }], AHORA);
    expect(origen.prendas[0].decision?.actual.resultado?.veredicto).toBe("se_mide_en_destino");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("lo que llega de la base", () => {
  it("se lee lo que trae y se ignora lo que no: un renglón con forma rara no tumba la lectura", () => {
    const v = {
      ahora: AHORA,
      decisiones: [
        { id: "a", producto_id: "p", color_codigo: null, accion: "cambie_lugar", anterior_id: null, anterior_accion: null, transferencia_id: null, nota: "  ", plazo_dias: 7, creado_en: CREADA, persona: "Ana Quispe", traslado: null, ventas: null },
        { id: "b", producto_id: "p", accion: "regalar", creado_en: CREADA },
        { id: "c", accion: "cambie_lugar", creado_en: CREADA },
        "basura",
      ],
      traslados_recientes: [{ id: "t", numero: 5, destino_id: "d", destino: "Tienda Lima", estado: "en_transito", creado_en: CREADA, prendas: [{ producto_id: "p", color_codigo: null, unidades: 3 }, { unidades: 1 }] }],
    };
    const l = leerDecisiones(v)!;
    expect(l.renglones).toHaveLength(1);
    expect(l.renglones[0]).toMatchObject({ id: "a", colorCodigo: null, nota: null, plazoDias: 7, persona: "Ana Quispe" });
    expect(l.trasladosRecientes).toEqual([{ id: "t", numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "en_transito", creadoEn: CREADA, prendas: [{ productoId: "p", colorCodigo: null, unidades: 3 }] }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("UN solo lugar dice «Por decidir»", () => {
  const raiz = join(__dirname, "..");
  const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

  it("ningún componente de Frescura ni frescura-pantalla.ts lee `estado.quieta` para decirlo: todos leen `porDecidir`", () => {
    const archivos = [...readdirSync(join(raiz, "components/frescura")).filter((f) => f.endsWith(".tsx")).map((f) => `components/frescura/${f}`), "lib/frescura-pantalla.ts", "lib/frescura-decisiones-pantalla.ts"];
    for (const a of archivos) {
      let texto: string;
      try {
        texto = leer(a);
      } catch {
        continue; // un archivo que todavía no existe no puede leerlo
      }
      // Las líneas de comentario no cuentan: aquí se explica por qué ya no se usa.
      const codigo = texto.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(codigo, a).not.toMatch(/estado\.quieta/);
    }
  });

  it("frescura-reglas.ts la usa solo para armar la base de la cifra y `porDecidir` inicial (el resto lo decide aplicarDecisiones)", () => {
    const codigo = leer("lib/frescura-reglas.ts").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect((codigo.match(/estado\.quieta/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("la pantalla llama a las funciones SQL con sus nombres exactos", () => {
  // PostgREST resuelve los argumentos por NOMBRE: un `p_plazo` en vez de `p_plazo_dias` no lo detecta ni el compilador ni
  // ninguna prueba de SQL, y en producción daría «no existe la función». Se compara la firma de la migración, lo que manda
  // cada llamada de la pantalla y los tipos escritos a mano de `packages/database`.
  const raiz = join(__dirname, "..");
  const sql = readFileSync(join(raiz, "../../supabase/migrations/20261001100100_frescura_decisiones_funciones.sql"), "utf8");
  const tipos = readFileSync(join(raiz, "../../packages/database/src/types.ts"), "utf8");
  const componentes = ["FrescuraDecidir.tsx"].map((f) => readFileSync(join(raiz, "components/frescura", f), "utf8")).join("\n");

  /** Los argumentos de la firma SQL: los obligatorios y los que tienen valor por defecto. */
  function firma(fn: string) {
    const m = new RegExp(`function retail\\.${fn}\\(([\\s\\S]*?)\\)\\s*returns`).exec(sql);
    if (!m) throw new Error(`la migración no define ${fn}`);
    const todos = m[1].split(",").map((x) => x.trim()).filter(Boolean);
    return { obligatorios: todos.filter((x) => !/\bdefault\b/i.test(x)).map((x) => x.split(/\s+/)[0]), todos: todos.map((x) => x.split(/\s+/)[0]) };
  }
  /** Las claves de cada `.rpc("fn", { … })` de la pantalla. */
  function llamadas(fn: string): string[][] {
    return [...componentes.matchAll(new RegExp(`\\.rpc\\(\\s*"${fn}",\\s*\\{([\\s\\S]*?)\\n?\\s*\\}\\)`, "g"))].map((m) => [...m[1].matchAll(/\b(p_[a-z_]+)\s*[:,]/g)].map((k) => k[1]));
  }
  /** Los argumentos de `types.ts` para esa función. */
  function enTipos(fn: string): string[] {
    const m = new RegExp(`\\b${fn}: \\{\\s*Args: \\{([\\s\\S]*?)\\}\\s*(?:Returns|\\n)`).exec(tipos);
    if (!m) throw new Error(`types.ts no trae ${fn}`);
    return [...m[1].matchAll(/\b(p_[a-z_]+)\??:/g)].map((k) => k[1]);
  }

  for (const fn of ["anotar_decision_frescura", "anular_decision_frescura"]) {
    it(`${fn}: cada llamada manda todos los obligatorios y ninguno que la función no tenga; los tipos dicen lo mismo`, () => {
      const f = firma(fn);
      const l = llamadas(fn);
      expect(l.length, `no encontré ninguna llamada a ${fn} en la pantalla`).toBeGreaterThan(0);
      for (const claves of l) {
        expect(claves.filter((c) => !f.todos.includes(c)), "argumentos que la función no tiene").toEqual([]);
        expect(f.obligatorios.filter((c) => !claves.includes(c)), "obligatorios que la pantalla no manda").toEqual([]);
      }
      expect(enTipos(fn).sort()).toEqual([...f.todos].sort());
    });
  }

  it("fn_frescura_decisiones: la web pide con p_ubicacion_id y p_dias, y los tipos coinciden", () => {
    const f = firma("fn_frescura_decisiones");
    expect(f.todos.sort()).toEqual(["p_dias", "p_ubicacion_id"]);
    expect(enTipos("fn_frescura_decisiones").sort()).toEqual(["p_dias", "p_ubicacion_id"]);
  });
});
