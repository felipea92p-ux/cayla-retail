import { describe, expect, it } from "vitest";
import { leerCalendario } from "./plan-compra-calendario";
import { campanasDelCalendario, type CampanaDelCalendario } from "./plan-compra-calendario-vista";
import {
  anioDeLaHoja,
  argsGuardarCampana,
  atajosDePausa,
  borradorDeLaCampana,
  hojaCambio,
  pausaPorDefecto,
  problemasDeLaHoja,
  sumarMeses,
  type BorradorDeCampanaDelCalendario,
  type ContextoDeLaHoja,
} from "./plan-compra-calendario-hoja";
import { conCalendario, leerCampanas } from "./plan-compra-reglas";

const HOY = "2026-10-26";
const fila = (extra: Record<string, unknown>) => ({ id: "d", etiqueta_id: null, nombre: null, desde_md: null, hasta_md: null, uso: "activa", pausa_hasta: null, repite: "anual", anio_unico: null, quitada: false, planes: [], por: "Felipe", ...extra });
const lista = (filas: unknown[] = [], anio = 2026) =>
  campanasDelCalendario(
    conCalendario(
      leerCampanas({
        planes: [],
        etiquetas: [
          { id: "nav", nombre: "Navidad", desde: "2026-12-11", hasta: "2026-12-25", plan_id: null, planes: [{ id: "pn", anio: 2026 }] },
          { id: "mad", nombre: "Día de la Madre", desde: "2026-04-26", hasta: "2026-05-10", plan_id: null, planes: [] },
          { id: "cyb", nombre: "CyberWow", desde: null, hasta: null, plan_id: null, planes: [] },
        ],
      }),
      leerCalendario({ soportado: true, hoy: HOY, filas }),
    )!,
    anio,
    HOY,
  );
const campana = (l: CampanaDelCalendario[], nombre: string) => l.find((c) => c.nombre === nombre)!;
const ctx: ContextoDeLaHoja = { hoy: HOY, otrosNombres: ["Día del Abuelo"], nombresDeInsignias: ["Navidad", "Día de la Madre", "CyberWow"] };
const nueva: BorradorDeCampanaDelCalendario = { nombre: "Día del Padre", desde: "2026-06-07", hasta: "2026-06-21", repite: "anual", uso: "activa", pausaHasta: "" };

describe("con qué arranca la hoja", () => {
  it("una nueva sale vacía, cada año y en mi plan; una que existe, con lo que vale hoy", () => {
    expect(borradorDeLaCampana(null)).toEqual({ nombre: "", desde: "", hasta: "", repite: "anual", uso: "activa", pausaHasta: "" });
    const l = lista([fila({ id: "a", etiqueta_id: "mad", uso: "pausada", pausa_hasta: "2027-02-01" }), fila({ id: "p", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21", repite: "unica", anio_unico: 2026 })]);
    expect(borradorDeLaCampana(campana(l, "Día de la Madre"))).toEqual({ nombre: "", desde: "2026-04-26", hasta: "2026-05-10", repite: "anual", uso: "pausada", pausaHasta: "2027-02-01" });
    expect(borradorDeLaCampana(campana(l, "Día del Padre"))).toMatchObject({ nombre: "Día del Padre", desde: "2026-06-07", hasta: "2026-06-21", repite: "unica" });
    // Una pausada que ya regresó se ve «activa»: guardar la deja activa de verdad.
    const volvio = lista([fila({ id: "a", etiqueta_id: "mad", uso: "pausada", pausa_hasta: "2026-10-26" })]);
    expect(borradorDeLaCampana(campana(volvio, "Día de la Madre"))).toMatchObject({ uso: "activa", pausaHasta: "" });
  });
});

describe("lo que impide guardar", () => {
  it("una campaña nueva se puede guardar con nombre y sus dos fechas", () => {
    expect(problemasDeLaHoja(nueva, null, ctx)).toEqual({});
  });
  it("el nombre: vacío, de más de 80 letras, repetido con otra propia o igual al de una insignia (sin tildes ni mayúsculas)", () => {
    expect(problemasDeLaHoja({ ...nueva, nombre: "  " }, null, ctx).nombre).toMatch(/Escribe el nombre/);
    expect(problemasDeLaHoja({ ...nueva, nombre: "x".repeat(81) }, null, ctx).nombre).toMatch(/80 letras/);
    expect(problemasDeLaHoja({ ...nueva, nombre: " día  del ABUELO" }, null, ctx).nombre).toMatch(/Ya hay una campaña con ese nombre/);
    expect(problemasDeLaHoja({ ...nueva, nombre: "dia de la madre" }, null, ctx).nombre).toMatch(/«dia de la madre» ya está en el calendario del sistema \(Catálogo ▸ Insignias\)/);
  });
  it("las fechas de una propia: las dos, que existan y que el fin no vaya antes del principio; una que cruza el año se escribe con sus fechas de verdad", () => {
    expect(problemasDeLaHoja({ ...nueva, desde: "" }, null, ctx).desde).toMatch(/desde cuándo/);
    expect(problemasDeLaHoja({ ...nueva, hasta: "" }, null, ctx).hasta).toMatch(/hasta cuándo/);
    expect(problemasDeLaHoja({ ...nueva, desde: "2026-04-31" }, null, ctx).desde).toMatch(/desde cuándo/);
    expect(problemasDeLaHoja({ ...nueva, hasta: "2026-06-01" }, null, ctx).hasta).toMatch(/antes de empezar/);
    expect(problemasDeLaHoja({ ...nueva, desde: "2026-12-20", hasta: "2027-01-06" }, null, ctx)).toEqual({});
  });
  it("una de Insignias con fechas no las pide; una sin fechas no puede entrar a mi plan sin ponérselas, pero sí quedar en «no la compro»", () => {
    const l = lista();
    const navidad = campana(l, "Navidad");
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(navidad), desde: "", hasta: "" }, navidad, ctx)).toEqual({});
    const cyber = campana(l, "CyberWow");
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(cyber), uso: "activa" }, cyber, ctx).desde).toMatch(/desde cuándo/);
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(cyber), uso: "pausada" }, cyber, ctx).hasta).toMatch(/hasta cuándo/);
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(cyber), uso: "no" }, cyber, ctx)).toEqual({});
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(cyber), uso: "activa", desde: "2026-11-03", hasta: "2026-11-05" }, cyber, ctx)).toEqual({});
    // Las dos o ninguna; y una de Insignias no pide nombre (es el de la insignia).
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(navidad), desde: "", hasta: "2026-12-30" }, navidad, ctx).desde).toMatch(/las dos fechas/);
    expect(problemasDeLaHoja({ ...borradorDeLaCampana(navidad), nombre: "" }, navidad, ctx).nombre).toBeUndefined();
  });
  it("una propia que ya existe puede quedarse con su nombre", () => {
    const l = lista([fila({ id: "p", nombre: "Día del Padre", desde_md: "06-07", hasta_md: "06-21" })]);
    const padre = campana(l, "Día del Padre");
    expect(problemasDeLaHoja(borradorDeLaCampana(padre), padre, { ...ctx, otrosNombres: ["Día del Abuelo"] })).toEqual({});
  });
  it("el regreso de una pausada: futuro, que exista, o vacío; si no está pausada no cuenta", () => {
    const pausada = { ...nueva, uso: "pausada" as const };
    expect(problemasDeLaHoja({ ...pausada, pausaHasta: "" }, null, ctx)).toEqual({});
    expect(problemasDeLaHoja({ ...pausada, pausaHasta: "2027-02-01" }, null, ctx)).toEqual({});
    expect(problemasDeLaHoja({ ...pausada, pausaHasta: "2026-10-26" }, null, ctx).pausaHasta).toMatch(/posterior a hoy/);
    expect(problemasDeLaHoja({ ...pausada, pausaHasta: "2026-10-01" }, null, ctx).pausaHasta).toMatch(/posterior a hoy/);
    expect(problemasDeLaHoja({ ...pausada, pausaHasta: "2027-02-30" }, null, ctx).pausaHasta).toMatch(/no existe/);
    expect(problemasDeLaHoja({ ...nueva, uso: "activa", pausaHasta: "2020-01-01" }, null, ctx)).toEqual({});
  });
});

describe("lo que se manda a la base", () => {
  it("una campaña nueva: sin id ni etiqueta, con su nombre limpio y las fechas en «mes-día»", () => {
    expect(argsGuardarCampana(null, { ...nueva, nombre: "  Día del   Padre " }, 2026)).toEqual({
      p_id: null, p_etiqueta_id: null, p_nombre: "Día del Padre", p_desde_md: "06-07", p_hasta_md: "06-21", p_uso: "activa", p_pausa_hasta: null, p_repite: "anual", p_anio_unico: null,
    });
  });
  it("una de Insignias sin decisión va por su etiqueta; con decisión, por su fila; nunca lleva nombre", () => {
    const sinDecision = campana(lista(), "Día de la Madre");
    expect(argsGuardarCampana(sinDecision, { ...borradorDeLaCampana(sinDecision), uso: "activa" }, 2026)).toMatchObject({ p_id: null, p_etiqueta_id: "mad", p_nombre: null });
    const conDecision = campana(lista([fila({ id: "a", etiqueta_id: "mad" })]), "Día de la Madre");
    expect(argsGuardarCampana(conDecision, borradorDeLaCampana(conDecision), 2026)).toMatchObject({ p_id: "a", p_etiqueta_id: null, p_nombre: null });
  });
  it("las fechas iguales a las de la insignia ese año no se mandan (sigue a la insignia); las distintas, sí", () => {
    const navidad = campana(lista(), "Navidad");
    expect(argsGuardarCampana(navidad, borradorDeLaCampana(navidad), 2026)).toMatchObject({ p_desde_md: null, p_hasta_md: null });
    expect(argsGuardarCampana(navidad, { ...borradorDeLaCampana(navidad), desde: "2026-11-20", hasta: "2026-12-31" }, 2026)).toMatchObject({ p_desde_md: "11-20", p_hasta_md: "12-31" });
    // Día de la Madre en 2027: sus fechas de ese año (móvil) son las de la insignia, y no se guardan.
    const madre27 = campana(lista([], 2027), "Día de la Madre");
    expect(argsGuardarCampana(madre27, borradorDeLaCampana(madre27), 2027)).toMatchObject({ p_desde_md: null, p_hasta_md: null });
  });
  it("pausada lleva su regreso (o ninguno); solo un año lleva el año en que termina", () => {
    const m = campana(lista(), "Día de la Madre");
    expect(argsGuardarCampana(m, { ...borradorDeLaCampana(m), uso: "pausada", pausaHasta: "2027-02-01" }, 2026)).toMatchObject({ p_uso: "pausada", p_pausa_hasta: "2027-02-01" });
    expect(argsGuardarCampana(m, { ...borradorDeLaCampana(m), uso: "pausada", pausaHasta: "" }, 2026)).toMatchObject({ p_uso: "pausada", p_pausa_hasta: null });
    expect(argsGuardarCampana(m, { ...borradorDeLaCampana(m), uso: "activa", pausaHasta: "2027-02-01" }, 2026).p_pausa_hasta).toBeNull();
    expect(argsGuardarCampana(null, { ...nueva, repite: "unica" }, 2026)).toMatchObject({ p_repite: "unica", p_anio_unico: 2026 });
    expect(argsGuardarCampana(null, { ...nueva, repite: "unica", desde: "2026-12-20", hasta: "2027-01-06" }, 2026)).toMatchObject({ p_anio_unico: 2027 });
    expect(anioDeLaHoja({ hasta: "" }, 2027)).toBe(2027);
  });
  it("una de Insignias sin fechas que se queda en «no» manda sin fechas", () => {
    const cyber = campana(lista(), "CyberWow");
    expect(argsGuardarCampana(cyber, { ...borradorDeLaCampana(cyber), uso: "no" }, 2026)).toMatchObject({ p_desde_md: null, p_hasta_md: null, p_uso: "no" });
  });
});

describe("cambió algo", () => {
  it("sin cambios no hay nada que guardar; el regreso solo cuenta si está pausada", () => {
    const m = campana(lista(), "Día de la Madre");
    const b = borradorDeLaCampana(m);
    expect(hojaCambio(b, b)).toBe(false);
    expect(hojaCambio({ ...b, repite: "unica" }, b)).toBe(true);
    expect(hojaCambio({ ...b, uso: "pausada" }, b)).toBe(true);
    expect(hojaCambio({ ...b, pausaHasta: "2027-01-01" }, b)).toBe(false);
    expect(hojaCambio({ ...nueva, nombre: "  Día del   Padre " }, { ...nueva })).toBe(false);
  });
});

describe("hasta cuándo descansa", () => {
  it("sumar meses no se pasa de fin de mes", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(sumarMeses("2026-10-26", 3)).toBe("2027-01-26");
    expect(sumarMeses("2026-11-30", 3)).toBe("2027-02-28");
    expect(sumarMeses("2026-10-26", 12)).toBe("2027-10-26");
    expect(sumarMeses("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("los atajos: un mes, tres, hasta fin de año, un año y hasta que la reactive; todos posteriores a hoy", () => {
    expect(atajosDePausa(HOY)).toEqual([
      { texto: "1 mes", fecha: "2026-11-26" },
      { texto: "3 meses", fecha: "2027-01-26" },
      { texto: "Hasta fin de año", fecha: "2026-12-31" },
      { texto: "1 año", fecha: "2027-10-26" },
      { texto: "Hasta que la reactive", fecha: null },
    ]);
    // El 31 de diciembre, «fin de año» ya no es futuro: es el del que viene.
    expect(atajosDePausa("2026-12-31").find((a) => a.texto === "Hasta fin de año")!.fecha).toBe("2027-12-31");
    for (const a of atajosDePausa("2026-12-31")) if (a.fecha) expect(a.fecha > "2026-12-31").toBe(true);
    expect(pausaPorDefecto(HOY)).toBe("2027-01-26");
  });
});
