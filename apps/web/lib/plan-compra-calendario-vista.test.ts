import { describe, expect, it } from "vitest";
import { leerCalendario } from "./plan-compra-calendario";
import type { EvidenciaDeCampana } from "./plan-compra-calendario-evidencia";
import {
  agruparCalendario,
  anioDelCalendario,
  aniosDelCalendario,
  barrasDeLaLinea,
  campanasAMedir,
  campanasDelCalendario,
  chipsDeLaFila,
  claveDeLaQueMasPesa,
  posicionDeHoy,
  resumenDelCalendario,
  rotuloDeFechas,
  sePuedeArmar,
  textoDelRegreso,
} from "./plan-compra-calendario-vista";
import { conCalendario, leerCampanas } from "./plan-compra-reglas";

const HOY = "2026-10-26";
const campanas = (filas: unknown[] = [], extra: { planes?: unknown[]; calendario?: boolean } = {}) =>
  conCalendario(
    leerCampanas({
      planes: extra.planes ?? [
        { id: "pn", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25", etiqueta_id: "nav", con_plan: 3, archivado: false, con_tope: false },
        { id: "pa", nombre: "Halloween 2025", desde: "2025-09-15", hasta: "2025-10-31", etiqueta_id: "hal", con_plan: 2, archivado: true, con_tope: false },
      ],
      etiquetas: [
        { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25", plan_id: "pn", planes: [{ id: "pn", anio: 2026 }] },
        { id: "mad", nombre: "Día de la Madre", desde: "2026-04-26", hasta: "2026-05-10", plan_id: null, planes: [] },
        { id: "gat", nombre: "Día del Gato", desde: "2026-10-24", hasta: "2026-10-30", plan_id: null, planes: [] },
        { id: "cyb", nombre: "CyberWow", desde: null, hasta: null, plan_id: null, planes: [] },
        { id: "hal", nombre: "Halloween", desde: "2026-09-15", hasta: "2026-10-31", plan_id: "pa", planes: [{ id: "pa", anio: 2025 }] },
      ],
    }),
    extra.calendario === false ? null : leerCalendario({ soportado: true, hoy: HOY, filas }),
  )!;
const fila = (extra: Record<string, unknown>) => ({ id: "d", etiqueta_id: null, nombre: null, desde_md: null, hasta_md: null, uso: "activa", pausa_hasta: null, repite: "anual", anio_unico: null, quitada: false, planes: [], por: "Felipe", ...extra });
const por = (lista: ReturnType<typeof campanasDelCalendario>, nombre: string) => lista.find((c) => c.nombre === nombre)!;
const evidencia = (mediana: number): EvidenciaDeCampana => ({ mediana, min: mediana, max: mediana, anioDelMin: 2020, anioDelMax: 2020, porAnio: [{ anio: 2020, multiplicador: mediana }] });

describe("cada campaña sale una vez, con lo que vale hoy", () => {
  it("las de Insignias sin decisión: la que ya tuvo algún plan está en mi plan; la que nunca lo tuvo, no la compro", () => {
    const l = campanasDelCalendario(campanas(), 2026, HOY);
    expect(l.map((c) => [c.nombre, c.uso, c.usoGuardado, c.decisionId])).toEqual([
      ["Navidad", "activa", null, null],
      ["Día de la Madre", "no", null, null],
      ["Día del Gato", "no", null, null],
      ["CyberWow", "no", null, null],
      ["Halloween", "activa", null, null],
    ]);
    expect(por(l, "Navidad").plan).toEqual({ id: "pn", nombre: "Navidad 2026" });
    // El plan de Halloween 2025 está archivado y es de otro año: no cuenta como «con plan 2026».
    expect(por(l, "Halloween").plan).toBeNull();
  });
  it("con decisión manda la decisión: pausada con regreso a futuro descansa; con regreso cumplido vuelve sola; quitada se marca", () => {
    const l = campanasDelCalendario(campanas([
      fila({ id: "a", etiqueta_id: "mad", uso: "pausada", pausa_hasta: "2027-02-01" }),
      fila({ id: "b", etiqueta_id: "gat", uso: "pausada", pausa_hasta: "2026-10-26" }),
      fila({ id: "c", etiqueta_id: "cyb", quitada: true }),
    ]), 2026, HOY);
    expect([por(l, "Día de la Madre").uso, por(l, "Día de la Madre").usoGuardado]).toEqual(["pausada", "pausada"]);
    expect([por(l, "Día del Gato").uso, por(l, "Día del Gato").usoGuardado]).toEqual(["activa", "pausada"]);
    expect(por(l, "CyberWow").quitada).toBe(true);
  });
  it("las fechas del plan son las que puso el calendario; si no, las de la insignia, y Día de la Madre sigue a su domingo (y avisa que es móvil)", () => {
    const l = campanasDelCalendario(campanas([fila({ id: "a", etiqueta_id: "nav", desde_md: "11-20", hasta_md: "12-31" }), fila({ id: "b", etiqueta_id: "cyb", desde_md: "11-03", hasta_md: "11-05" })]), 2027, HOY);
    expect(por(l, "Navidad").fechas).toEqual({ desde: "2027-11-20", hasta: "2027-12-31" });
    expect(por(l, "Navidad").fechasDeLaInsignia).toEqual({ desde: "2027-12-11", hasta: "2027-12-25" });
    expect(por(l, "CyberWow").fechas).toEqual({ desde: "2027-11-03", hasta: "2027-11-05" });
    expect(por(l, "CyberWow").fechasDeLaInsignia).toBeNull();
    expect(por(l, "Día de la Madre").fechas).toEqual({ desde: "2027-04-25", hasta: "2027-05-09" });
    expect(por(l, "Día de la Madre").movil).toBe(true);
    expect(por(l, "Navidad").movil).toBe(false);
    // Si el calendario le fija fechas propias, deja de ser móvil: cae el mismo día todos los años.
    expect(por(campanasDelCalendario(campanas([fila({ id: "m", etiqueta_id: "mad", desde_md: "04-26", hasta_md: "05-10" })]), 2027, HOY), "Día de la Madre").movil).toBe(false);
    // Una sin fechas y sin las del calendario no tiene fechas.
    expect(por(campanasDelCalendario(campanas(), 2027, HOY), "CyberWow").fechas).toBeNull();
  });
  it("las propias salen con su nombre, su plan de ese año y las fechas del calendario; una quitada también sale", () => {
    const l = campanasDelCalendario(campanas([
      fila({ id: "p1", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21", planes: [{ id: "x", nombre: "Día del Padre 2027", anio: 2027, archivado: false }, { id: "y", nombre: "Día del Padre 2026", anio: 2026, archivado: true }] }),
      fila({ id: "p2", nombre: "Quitada", desde_md: "01-01", hasta_md: "01-02", quitada: true }),
    ]), 2027, HOY);
    const padre = por(l, "Día del Padre");
    expect(padre).toMatchObject({ clave: "p:p1", esPropia: true, etiquetaId: null, uso: "activa", fechas: { desde: "2027-06-07", hasta: "2027-06-21" }, plan: { id: "x", nombre: "Día del Padre 2027" } });
    expect(por(campanasDelCalendario(campanas([fila({ id: "p1", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21", planes: [{ id: "y", nombre: "Día del Padre 2026", anio: 2026, archivado: true }] })]), 2026, HOY), "Día del Padre").plan).toBeNull();
    expect(por(l, "Quitada").quitada).toBe(true);
  });
  it("sin calendario en la base, no hay propias y las de Insignias salen sin decisión", () => {
    const l = campanasDelCalendario(campanas([], { calendario: false }), 2026, HOY);
    expect(l.length).toBe(5);
    expect(l.every((c) => c.decisionId === null && !c.esPropia)).toBe(true);
  });
});

describe("qué se mide y con qué fechas", () => {
  it("cada campaña con su llave y sus fechas de venta en cualquier año; la sin fechas usa las del calendario, y la propia, solo las suyas", () => {
    const a = campanasAMedir(campanas([fila({ id: "c", etiqueta_id: "cyb", desde_md: "11-03", hasta_md: "11-05" }), fila({ id: "p", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21" })]));
    const f = (clave: string, anio: number) => a.find((x) => x.clave === clave)!.fechasEn(anio);
    expect(a.map((x) => x.clave)).toEqual(["e:nav", "e:mad", "e:gat", "e:cyb", "e:hal", "p:p"]);
    expect(f("e:nav", 2019)).toEqual({ desde: "2019-12-11", hasta: "2019-12-25" });
    // Día de la Madre sigue a su domingo: 2019 → 12 de mayo.
    expect(f("e:mad", 2019)).toEqual({ desde: "2019-04-28", hasta: "2019-05-12" });
    expect(f("e:cyb", 2022)).toEqual({ desde: "2022-11-03", hasta: "2022-11-05" });
    expect(f("p:p", 2022)).toEqual({ desde: "2022-06-07", hasta: "2022-06-21" });
    // Con las fechas de la insignia a mano, las del calendario (más anchas, de compra) no cambian lo que se mide de la venta.
    const ancha = campanasAMedir(campanas([fila({ id: "n", etiqueta_id: "nav", desde_md: "11-20", hasta_md: "12-31" })]));
    expect(ancha.find((x) => x.clave === "e:nav")!.fechasEn(2024)).toEqual({ desde: "2024-12-11", hasta: "2024-12-25" });
    // Una sin fechas y sin las del calendario no se mide.
    expect(campanasAMedir(campanas()).find((x) => x.clave === "e:cyb")!.fechasEn(2024)).toBeNull();
  });
});

describe("las cuatro listas", () => {
  const lista = () =>
    campanasDelCalendario(campanas([
      fila({ id: "a", etiqueta_id: "mad", uso: "pausada", pausa_hasta: "2027-02-01" }),
      fila({ id: "b", etiqueta_id: "cyb", quitada: true }),
      fila({ id: "c", etiqueta_id: "gat", uso: "activa", repite: "unica", anio_unico: 2027 }),
      fila({ id: "p1", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21" }),
    ]), 2026, HOY);
  it("en mi plan por fecha, las pausadas aparte, las que no compro con historia primero y las quitadas siempre", () => {
    const g = agruparCalendario(lista(), 2026, { "e:gat": evidencia(1), "e:cyb": null });
    expect(g.enMiPlan.map((c) => c.nombre)).toEqual(["Día del Padre", "Halloween", "Navidad"]);
    expect(g.pausadas.map((c) => c.nombre)).toEqual(["Día de la Madre"]);
    // «Solo 2027» no sale en 2026; CyberWow está quitada.
    expect(g.noLasCompro.map((c) => c.nombre)).toEqual([]);
    expect(g.quitadas.map((c) => c.nombre)).toEqual(["CyberWow"]);
    // En 2027, el Gato (solo ese año) sí sale, y ahora en mi plan.
    expect(agruparCalendario(campanasDelCalendario(campanas([fila({ id: "c", etiqueta_id: "gat", uso: "activa", repite: "unica", anio_unico: 2027 })]), 2027, HOY), 2027).enMiPlan.map((c) => c.nombre)).toContain("Día del Gato");
  });
  it("las que no compro: las que tienen historia primero; a igual, por nombre sin tildes", () => {
    const g = agruparCalendario(campanasDelCalendario(campanas(), 2026, HOY), 2026, { "e:gat": evidencia(1.2) });
    expect(g.noLasCompro.map((c) => c.nombre)).toEqual(["Día del Gato", "CyberWow", "Día de la Madre"]);
  });
  it("el resumen cuenta campañas, pausadas y fechas que no compras, en singular y plural", () => {
    const g = agruparCalendario(campanasDelCalendario(campanas([fila({ id: "a", etiqueta_id: "mad", uso: "pausada" })]), 2026, HOY), 2026);
    expect(resumenDelCalendario(g, 2026)).toEqual({ titulo: "Tu calendario 2026: 2 campañas", detalle: "1 pausada · 2 fechas que no compras" });
    const uno = agruparCalendario(campanasDelCalendario(campanas([fila({ id: "a", etiqueta_id: "mad", uso: "activa" }), fila({ id: "h", etiqueta_id: "hal", uso: "no" }), fila({ id: "g", etiqueta_id: "gat", uso: "no" }), fila({ id: "c", etiqueta_id: "cyb", quitada: true }), fila({ id: "n", etiqueta_id: "nav", uso: "no" })]), 2026, HOY), 2026);
    expect(resumenDelCalendario(uno, 2026)).toEqual({ titulo: "Tu calendario 2026: 1 campaña", detalle: "3 fechas que no compras" });
    expect(resumenDelCalendario({ enMiPlan: [], pausadas: [], noLasCompro: [uno.noLasCompro[0]], quitadas: [] }, 2027)).toEqual({ titulo: "Tu calendario 2027: 0 campañas", detalle: "1 fecha que no compras" });
  });
  it("la que más pesa: la de mi plan con la mediana más alta, si es un pico claro", () => {
    const g = agruparCalendario(lista(), 2026);
    expect(claveDeLaQueMasPesa(g, { "e:nav": evidencia(2), "e:hal": evidencia(0.9) })).toBe("e:nav");
    expect(claveDeLaQueMasPesa(g, { "e:nav": evidencia(1.4), "e:hal": evidencia(1.2) })).toBeNull();
    expect(claveDeLaQueMasPesa(g, { "e:nav": evidencia(1.6), "p:p1": evidencia(1.9) })).toBe("p:p1");
    expect(claveDeLaQueMasPesa(g, {})).toBeNull();
  });
});

describe("lo que dice cada fila", () => {
  it("las fechas en tienda («31 ene – 14 feb») y «sin fechas»", () => {
    expect(rotuloDeFechas({ desde: "2027-01-31", hasta: "2027-02-14" })).toBe("31 ene – 14 feb");
    expect(rotuloDeFechas(null)).toBe("sin fechas");
  });
  it("hasta cuándo descansa una pausada", () => {
    expect(textoDelRegreso("2027-02-01")).toBe("1 febrero 2027");
    expect(textoDelRegreso("2026-12-31")).toBe("31 diciembre 2026");
    expect(textoDelRegreso(null)).toBe("hasta que la reactives");
  });
  it("los chips: cada año o solo uno, fecha móvil, con plan y pausada", () => {
    const l = campanasDelCalendario(campanas([fila({ id: "a", etiqueta_id: "mad", uso: "pausada", pausa_hasta: "2027-02-01" }), fila({ id: "g", etiqueta_id: "gat", repite: "unica", anio_unico: 2026 })]), 2026, HOY);
    expect(chipsDeLaFila(por(l, "Navidad"), 2026).map((c) => c.texto)).toEqual(["Cada año", "Con plan 2026"]);
    expect(chipsDeLaFila(por(l, "Día de la Madre"), 2026).map((c) => c.texto)).toEqual(["Cada año", "Fecha móvil", "Pausada hasta 1 febrero 2027"]);
    expect(chipsDeLaFila(por(l, "Día del Gato"), 2026).map((c) => c.texto)).toEqual(["Solo 2026"]);
  });
  it("se puede armar su plan si está en mi plan, no lo tiene, tiene fechas y no terminó", () => {
    const l = campanasDelCalendario(campanas([fila({ id: "m", etiqueta_id: "mad", uso: "activa" }), fila({ id: "c", etiqueta_id: "cyb", uso: "activa" })]), 2027, HOY);
    expect(sePuedeArmar(por(l, "Día de la Madre"), HOY)).toBe(true);
    expect(sePuedeArmar(por(l, "Navidad"), HOY)).toBe(true);
    expect(sePuedeArmar(por(l, "CyberWow"), HOY)).toBe(false);
    // La de este año ya tiene su plan.
    expect(sePuedeArmar(por(campanasDelCalendario(campanas(), 2026, HOY), "Navidad"), HOY)).toBe(false);
    // Esa misma campaña de este año ya terminó.
    expect(sePuedeArmar(por(campanasDelCalendario(campanas([fila({ id: "m", etiqueta_id: "mad", uso: "activa" })]), 2026, HOY), "Día de la Madre"), HOY)).toBe(false);
  });
});

describe("la línea del año", () => {
  it("cada barra cae donde empieza y dura lo que dura; hoy cae donde es y solo en el año de hoy", () => {
    const l = campanasDelCalendario(campanas(), 2026, HOY);
    const b = barrasDeLaLinea(l, 2026);
    expect(b.map((x) => x.nombre)).toEqual(["Día de la Madre", "Halloween", "Día del Gato", "Navidad"]);
    const navidad = b.find((x) => x.nombre === "Navidad")!;
    expect(navidad.izquierda).toBeCloseTo((344 / 365) * 100, 1);
    expect(navidad.ancho).toBeCloseTo((15 / 365) * 100, 1);
    expect(navidad.rotulo).toBe("11 dic – 25 dic");
    expect(posicionDeHoy(HOY, 2026)).toBeCloseTo((298 / 365) * 100, 1);
    expect(posicionDeHoy(HOY, 2027)).toBeNull();
    // Una de un solo día se ve; una que cruza el año se pega al borde.
    const una = campanasDelCalendario(campanas([fila({ id: "p", nombre: "Un día", desde_md: "03-03", hasta_md: "03-03" }), fila({ id: "q", nombre: "Cruza", desde_md: "12-20", hasta_md: "01-06" })]), 2027, HOY);
    const barras = barrasDeLaLinea(una, 2027);
    expect(barras.find((x) => x.nombre === "Un día")!.ancho).toBeGreaterThanOrEqual(0.9);
    const cruza = barras.find((x) => x.nombre === "Cruza")!;
    expect(cruza.izquierda).toBe(0);
    expect(cruza.izquierda + cruza.ancho).toBeLessThan(5);
    // Sin fechas, no hay barra.
    expect(barrasDeLaLinea(l, 2026).some((x) => x.nombre === "CyberWow")).toBe(false);
  });
});

describe("el año que se mira", () => {
  it("el de hoy y el que viene; cualquier otro de la URL cae al de hoy", () => {
    expect(aniosDelCalendario(HOY)).toEqual([2026, 2027]);
    expect(anioDelCalendario("2027", HOY)).toBe(2027);
    expect(anioDelCalendario("2028", HOY)).toBe(2026);
    expect(anioDelCalendario("x", HOY)).toBe(2026);
    expect(anioDelCalendario(undefined, HOY)).toBe(2026);
  });
});
