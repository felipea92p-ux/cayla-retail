import { describe, expect, it } from "vitest";
import {
  argsInterruptor,
  argsQuitar,
  argsRestaurar,
  cuentaEnElAnio,
  decisionesPorEtiqueta,
  fechaDeMd,
  fechasDeLaDecision,
  leerCalendario,
  propiasQueSeOfrecen,
  seOfrece,
  usoEfectivo,
  type DecisionDeCampana,
} from "./plan-compra-calendario";

const fila = (extra: Record<string, unknown> = {}) => ({
  id: "d1", etiqueta_id: "e1", nombre: null, desde_md: null, hasta_md: null, uso: "activa", pausa_hasta: null, repite: "anual", anio_unico: null, quitada: false, planes: [], por: "Felipe", en: "2026-10-26T15:00:00+00:00", ...extra,
});
const lectura = (filas: unknown[], extra: Record<string, unknown> = {}) => ({ soportado: true, hoy: "2026-10-26", filas, ...extra });
const decision = (extra: Partial<DecisionDeCampana> = {}): DecisionDeCampana => ({
  id: "d1", etiquetaId: "e1", nombre: null, desdeMd: null, hastaMd: null, uso: "activa", pausaHasta: null, repite: "anual", anioUnico: null, quitada: false, planes: [], por: "Felipe", ...extra,
});

describe("leer lo que manda la base", () => {
  it("sin la marca «soportado», sin «hoy» o con una forma que no es, no hay calendario (la base todavía no lo tiene)", () => {
    expect(leerCalendario(null)).toBeNull();
    expect(leerCalendario([])).toBeNull();
    expect(leerCalendario({ ...lectura([]), soportado: false })).toBeNull();
    expect(leerCalendario({ ...lectura([]), hoy: "26/10/2026" })).toBeNull();
    expect(leerCalendario({ soportado: true, hoy: "2026-10-26", filas: "x" })).toBeNull();
  });
  it("lee cada decisión con su uso, sus fechas, su repetición y sus planes", () => {
    const l = leerCalendario(lectura([
      fila({ uso: "pausada", pausa_hasta: "2027-02-01", desde_md: "01-20", hasta_md: "02-14" }),
      fila({ id: "d2", etiqueta_id: null, nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21", repite: "unica", anio_unico: 2027, planes: [{ id: "p1", nombre: "Día del Padre 2027", anio: 2027, archivado: false }] }),
    ]))!;
    expect(l.hoy).toBe("2026-10-26");
    expect(l.decisiones[0]).toMatchObject({ id: "d1", etiquetaId: "e1", uso: "pausada", pausaHasta: "2027-02-01", desdeMd: "01-20", hastaMd: "02-14", repite: "anual", anioUnico: null });
    expect(l.decisiones[1]).toMatchObject({ etiquetaId: null, nombre: "Día del Padre", repite: "unica", anioUnico: 2027 });
    expect(l.decisiones[1].planes).toEqual([{ id: "p1", nombre: "Día del Padre 2027", anio: 2027, archivado: false }]);
  });
  it("una fila que no calza se descarta sin llevarse a las demás; nunca se inventa una", () => {
    const l = leerCalendario(lectura([
      fila(),
      { id: "x" },
      "x",
      null,
      fila({ id: "d3", uso: "quizas" }),
      fila({ id: "d4", repite: "siempre" }),
      fila({ id: "d5", etiqueta_id: null, nombre: null }),
      fila({ id: "d6", repite: "unica", anio_unico: null }),
      fila({ id: "d7", etiqueta_id: "e7" }),
    ]))!;
    expect(l.decisiones.map((d) => d.id)).toEqual(["d1", "d7"]);
  });
  it("las dos fechas o ninguna; un regreso solo cuenta si está pausada; el nombre de una insignia es el de la insignia", () => {
    const l = leerCalendario(lectura([
      fila({ id: "a", desde_md: "01-20", hasta_md: null }),
      fila({ id: "b", desde_md: "13-45", hasta_md: "02-14" }),
      fila({ id: "c", uso: "activa", pausa_hasta: "2027-02-01" }),
      fila({ id: "d", nombre: "Otro nombre" }),
    ]))!;
    const por = (id: string) => l.decisiones.find((d) => d.id === id)!;
    expect(por("a")).toMatchObject({ desdeMd: null, hastaMd: null });
    expect(por("b")).toMatchObject({ desdeMd: null, hastaMd: null });
    expect(por("c").pausaHasta).toBeNull();
    expect(por("d").nombre).toBeNull();
  });
  it("una fila que no es un plan: un plan sin nombre o con un año que no es número se descarta, no se inventa", () => {
    const l = leerCalendario(lectura([fila({ id: "p", etiqueta_id: null, nombre: "Propia", planes: [{ id: "p1", nombre: "A 2027", anio: 2027 }, { id: "p2" }, "x", { id: "p3", nombre: "A 2028", anio: "2028" }] })]))!;
    expect(l.decisiones[0].planes).toEqual([{ id: "p1", nombre: "A 2027", anio: 2027, archivado: false }]);
  });
});

describe("qué vale hoy", () => {
  it("una pausada con fecha de regreso vuelve sola ese día; sin fecha descansa hasta que la reactiven; el resto, lo que dice", () => {
    expect(usoEfectivo({ uso: "pausada", pausaHasta: "2026-10-27" }, "2026-10-26")).toBe("pausada");
    expect(usoEfectivo({ uso: "pausada", pausaHasta: "2026-10-26" }, "2026-10-26")).toBe("activa");
    expect(usoEfectivo({ uso: "pausada", pausaHasta: "2026-10-01" }, "2026-10-26")).toBe("activa");
    expect(usoEfectivo({ uso: "pausada", pausaHasta: null }, "2030-01-01")).toBe("pausada");
    expect(usoEfectivo({ uso: "no", pausaHasta: null }, "2026-10-26")).toBe("no");
    expect(usoEfectivo({ uso: "activa", pausaHasta: null }, "2026-10-26")).toBe("activa");
  });
  it("«cada año» cuenta siempre; «solo un año», únicamente en el suyo", () => {
    expect(cuentaEnElAnio({ repite: "anual", anioUnico: null }, 2031)).toBe(true);
    expect(cuentaEnElAnio({ repite: "unica", anioUnico: 2027 }, 2027)).toBe(true);
    expect(cuentaEnElAnio({ repite: "unica", anioUnico: 2027 }, 2026)).toBe(false);
    expect(cuentaEnElAnio({ repite: "unica", anioUnico: 2027 }, 2028)).toBe(false);
  });
  it("el 29 de febrero cae al 28 en un año que no es bisiesto, y se queda en un bisiesto", () => {
    expect(fechaDeMd("02-29", 2027)).toBe("2027-02-28");
    expect(fechaDeMd("02-29", 2028)).toBe("2028-02-29");
    expect(fechaDeMd("12-31", 2026)).toBe("2026-12-31");
  });
  it("las fechas del plan van al año en que TERMINA la campaña; una que cruza el año empieza en el anterior", () => {
    expect(fechasDeLaDecision({ desdeMd: "06-07", hastaMd: "06-21" }, 2027)).toEqual({ desde: "2027-06-07", hasta: "2027-06-21" });
    expect(fechasDeLaDecision({ desdeMd: "12-20", hastaMd: "01-06" }, 2027)).toEqual({ desde: "2026-12-20", hasta: "2027-01-06" });
    expect(fechasDeLaDecision({ desdeMd: "02-29", hastaMd: "03-05" }, 2027)).toEqual({ desde: "2027-02-28", hasta: "2027-03-05" });
    expect(fechasDeLaDecision({ desdeMd: null, hastaMd: null }, 2027)).toBeNull();
  });
});

describe("qué campañas de Insignias se ofrecen", () => {
  const conPlan = { planes: [{ id: "p", anio: 2025 }] };
  const sinPlan = { planes: [] };
  it("sin decisión: la que ya tuvo algún plan sigue; la que nunca lo tuvo espera a que la prendas", () => {
    expect(seOfrece(conPlan, undefined, "2026-10-26")).toBe(true);
    expect(seOfrece(sinPlan, undefined, "2026-10-26")).toBe(false);
  });
  it("con decisión manda la decisión, tenga o no plan: activa se ofrece; no y pausada, no; pausada que ya regresó, sí; quitada, nunca", () => {
    expect(seOfrece(sinPlan, decision({ uso: "activa" }), "2026-10-26")).toBe(true);
    expect(seOfrece(conPlan, decision({ uso: "no" }), "2026-10-26")).toBe(false);
    expect(seOfrece(conPlan, decision({ uso: "pausada", pausaHasta: "2027-02-01" }), "2026-10-26")).toBe(false);
    expect(seOfrece(conPlan, decision({ uso: "pausada", pausaHasta: "2027-02-01" }), "2027-02-01")).toBe(true);
    expect(seOfrece(conPlan, decision({ uso: "activa", quitada: true }), "2026-10-26")).toBe(false);
  });
  it("las propias que se ofrecen son las activas sin quitar; las de Insignias no entran aquí", () => {
    const l = leerCalendario(lectura([
      fila({ id: "a", etiqueta_id: null, nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21" }),
      fila({ id: "b", etiqueta_id: null, nombre: "Pausada", desde_md: "06-07", hasta_md: "06-21", uso: "pausada" }),
      fila({ id: "c", etiqueta_id: null, nombre: "Quitada", desde_md: "06-07", hasta_md: "06-21", quitada: true }),
      fila({ id: "d", etiqueta_id: "e9" }),
    ]))!;
    expect(propiasQueSeOfrecen(l, "2026-10-26").map((d) => d.id)).toEqual(["a"]);
  });
  it("las decisiones de Insignias se buscan por su etiqueta", () => {
    const l = leerCalendario(lectura([fila({ id: "a", etiqueta_id: "e1" }), fila({ id: "b", etiqueta_id: null, nombre: "Propia", desde_md: "06-07", hasta_md: "06-21" })]))!;
    const m = decisionesPorEtiqueta(l);
    expect([...m.keys()]).toEqual(["e1"]);
    expect(decisionesPorEtiqueta(null).size).toBe(0);
  });
});

describe("lo que se manda a la base", () => {
  it("una fila que ya existe va por su id (sin etiqueta); una insignia sin decisión, por su etiqueta", () => {
    expect(argsInterruptor({ decisionId: "d1", etiquetaId: "e1" }, "activa")).toEqual({ p_id: "d1", p_etiqueta_id: null, p_uso: "activa" });
    expect(argsInterruptor({ decisionId: null, etiquetaId: "e1" }, "no")).toEqual({ p_id: null, p_etiqueta_id: "e1", p_uso: "no" });
    expect(argsQuitar({ decisionId: "d1", etiquetaId: "e1" })).toEqual({ p_id: "d1", p_etiqueta_id: null });
    expect(argsQuitar({ decisionId: null, etiquetaId: "e1" })).toEqual({ p_id: null, p_etiqueta_id: "e1" });
    expect(argsRestaurar("d1")).toEqual({ p_id: "d1" });
  });
});
