import { describe, expect, it } from "vitest";
import {
  ayudaDelRango,
  aniosAMedir,
  DIAS_POR_LECTURA,
  evidenciaDeCampana,
  multiplicadorLegible,
  notaDelAnioRaro,
  pocaHistoria,
  posicionEnLaEscala,
  textoDeAnios,
  tiendaDeReferencia,
  unirHistoriales,
  ventanasDeLectura,
  veredictoDe,
  type EvidenciaDeCampana,
} from "./plan-compra-calendario-evidencia";
import { diasEntre, mismaFechaEn, sumarDias, type LecturaHistorial, type TiendaHistorial } from "./plan-compra-historial";

const TRU: TiendaHistorial = { id: "tru", nombre: "Tienda TRU", erpDesde: "2026-09-30", historiaDesde: "2017-09-01" };
const AQP: TiendaHistorial = { id: "aqp", nombre: "Tienda AQP", erpDesde: "2026-09-30", historiaDesde: "2024-02-09" };
const LIM: TiendaHistorial = { id: "lim", nombre: "Tienda LIM", erpDesde: "2026-09-30", historiaDesde: null };
const SIN: TiendaHistorial = { id: "sin", nombre: "Sin datos", erpDesde: null, historiaDesde: null };

/** Una historia armada a mano: 100 soles cada día, salvo los días de campaña de cada año (`factor` por año). */
function historia(t: TiendaHistorial, hoy: string, campana: (anio: number) => { desde: string; hasta: string }, factor: (anio: number) => number): Pick<LecturaHistorial, "hoy" | "dias"> {
  const dias = new Map<string, number>();
  const desde = t.historiaDesde ?? t.erpDesde!;
  for (let f = desde; f < hoy; f = sumarDias(f, 1)) dias.set(f, 100);
  for (let anio = Number(desde.slice(0, 4)); anio <= Number(hoy.slice(0, 4)); anio++) {
    const c = campana(anio);
    for (let f = c.desde; f <= c.hasta; f = sumarDias(f, 1)) if (dias.has(f)) dias.set(f, 100 * factor(anio));
  }
  return { hoy, dias: new Map([[t.id, dias]]) };
}
const navidad = (anio: number) => ({ desde: `${anio}-12-11`, hasta: `${anio}-12-25` });

describe("lo que dijo la historia de una campaña", () => {
  it("la mediana de los años medidos, con el menor y el mayor y el año de cada uno", () => {
    const factor = (a: number) => ({ 2018: 2, 2019: 2.5, 2020: 0.4, 2021: 2.2, 2022: 2, 2023: 1.8, 2024: 2.1, 2025: 2.7 })[a] ?? 1;
    const l = historia(TRU, "2026-10-26", navidad, factor);
    const ev = evidenciaDeCampana(l, TRU, navidad, aniosAMedir(TRU, l.hoy))!;
    // 2017 también se mide: la historia empieza el 1 de setiembre y los 60 días de base de su Navidad (desde el 12 de octubre) ya están adentro; sin factor, vale ×1.
    expect(ev.porAnio.map((x) => x.anio)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(ev.min).toBeCloseTo(0.4, 6);
    expect(ev.anioDelMin).toBe(2020);
    expect(ev.max).toBeCloseTo(2.7, 6);
    expect(ev.anioDelMax).toBe(2025);
    expect(ev.mediana).toBeCloseTo(2, 6);
  });
  it("un año que no se puede medir no cuenta: la campaña de hoy en curso, una que viene, una de antes de que la tienda tuviera historia o con la base sin ventas", () => {
    // Hoy es 20 de diciembre de 2026: Navidad 2026 está en curso y no cuenta; 2027 no llegó.
    const l = historia(AQP, "2026-12-20", navidad, (a) => (a === 2024 ? 3 : a === 2025 ? 2 : 5));
    const ev = evidenciaDeCampana(l, AQP, navidad, [2023, 2024, 2025, 2026, 2027])!;
    expect(ev.porAnio.map((x) => [x.anio, Math.round(x.multiplicador * 10) / 10])).toEqual([[2024, 3], [2025, 2]]);
    // Un año sin ninguna venta en la base de 60 días tampoco se mide.
    const hueco = historia(AQP, "2026-10-26", navidad, () => 2);
    for (const f of [...hueco.dias.get("aqp")!.keys()]) if (f >= "2025-10-01" && f <= "2025-12-10") hueco.dias.get("aqp")!.delete(f);
    expect(evidenciaDeCampana(hueco, AQP, navidad, [2025])).toBeNull();
  });
  it("sin ningún año medible, no hay historia propia (nunca un cero inventado)", () => {
    const l = historia(LIM, "2026-10-26", navidad, () => 2);
    expect(evidenciaDeCampana(l, LIM, navidad, [2025, 2026])).toBeNull();
    expect(evidenciaDeCampana(l, SIN, navidad, [2025])).toBeNull();
    // Una campaña sin fechas en ese año tampoco.
    expect(evidenciaDeCampana(historia(TRU, "2026-10-26", navidad, () => 2), TRU, () => null, [2024, 2025])).toBeNull();
  });
  it("una campaña que cruza el año se mide con sus fechas de cada año", () => {
    const cruza = (anio: number) => ({ desde: `${anio - 1}-12-20`, hasta: `${anio}-01-06` });
    const l = historia(TRU, "2026-10-26", (a) => ({ desde: `${a}-12-20`, hasta: `${a + 1}-01-06` }), () => 1.6);
    const ev = evidenciaDeCampana(l, TRU, cruza, [2019, 2020, 2021])!;
    expect(ev.porAnio.length).toBe(3);
    expect(ev.mediana).toBeCloseTo(1.6, 1);
  });
});

describe("con qué tienda y qué años se mide", () => {
  it("la tienda con más historia; a igual historia, la de nombre primero; ninguna sin datos", () => {
    expect(tiendaDeReferencia({ tiendas: [AQP, LIM, TRU] })?.id).toBe("tru");
    expect(tiendaDeReferencia({ tiendas: [LIM, AQP] })?.id).toBe("aqp");
    expect(tiendaDeReferencia({ tiendas: [{ ...AQP, historiaDesde: "2017-09-01" }, TRU] })?.id).toBe("aqp");
    expect(tiendaDeReferencia({ tiendas: [SIN] })).toBeNull();
    expect(tiendaDeReferencia({ tiendas: [] })).toBeNull();
  });
  it("del primer año con historia al de hoy", () => {
    expect(aniosAMedir(TRU, "2026-10-26")).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(aniosAMedir(AQP, "2026-10-26")).toEqual([2024, 2025, 2026]);
    expect(aniosAMedir(SIN, "2026-10-26")).toEqual([]);
  });
});

describe("el veredicto, en palabras de tienda", () => {
  const con = (mediana: number) => ({ mediana });
  it("lo dice la mediana, con los cortes en ×1,5, ×1,1 y ×0,95", () => {
    expect(veredictoDe(null)).toEqual({ texto: "Sin historia propia", tono: "neutro" });
    expect(veredictoDe(con(2.0))).toEqual({ texto: "Pico claro", tono: "verde" });
    expect(veredictoDe(con(1.5))).toEqual({ texto: "Pico claro", tono: "verde" });
    expect(veredictoDe(con(1.49))).toEqual({ texto: "Sube un poco", tono: "verde" });
    expect(veredictoDe(con(1.1))).toEqual({ texto: "Sube un poco", tono: "verde" });
    expect(veredictoDe(con(1.09))).toEqual({ texto: "No se nota", tono: "neutro" });
    expect(veredictoDe(con(0.95))).toEqual({ texto: "No se nota", tono: "neutro" });
    expect(veredictoDe(con(0.94))).toEqual({ texto: "No sube", tono: "ambar" });
    expect(veredictoDe(con(0.85))).toEqual({ texto: "No sube", tono: "ambar" });
  });
  it("menos de tres años es poca historia", () => {
    const ev = (n: number) => ({ porAnio: Array.from({ length: n }, (_, i) => ({ anio: 2020 + i, multiplicador: 1 })) });
    expect(pocaHistoria(ev(1))).toBe(true);
    expect(pocaHistoria(ev(2))).toBe(true);
    expect(pocaHistoria(ev(3))).toBe(false);
    expect(textoDeAnios(1)).toBe("1 año");
    expect(textoDeAnios(7)).toBe("7 años");
  });
  it("lo que dice la barra al pasar el mouse: la mediana, el menor y el mayor, y cuántos años", () => {
    const ev: EvidenciaDeCampana = { mediana: 1.1, min: 0.9, max: 1.3, anioDelMin: 2019, anioDelMax: 2022, porAnio: Array.from({ length: 7 }, (_, i) => ({ anio: 2018 + i, multiplicador: 1.1 })) };
    expect(ayudaDelRango(ev)).toBe("Mediana ×1.1; entre ×0.9 y ×1.3 en 7 años");
  });
  it("un año que se aparta mucho de los demás se señala sin inventar la causa; con pocos años, no", () => {
    const base = { max: 1.4, anioDelMax: 2022, porAnio: [1, 2, 3, 4].map((i) => ({ anio: 2017 + i, multiplicador: 1.2 })) };
    expect(notaDelAnioRaro({ ...base, mediana: 1.2, min: 0.3, anioDelMin: 2020 })).toBe("El ×0.3 es de 2020: se aparta de los demás años. Mira si ese año fue raro (tiendas cerradas, por ejemplo).");
    expect(notaDelAnioRaro({ ...base, mediana: 1.2, min: 0.9, anioDelMin: 2020 })).toBeNull();
    expect(notaDelAnioRaro({ ...base, porAnio: base.porAnio.slice(0, 2), mediana: 1.2, min: 0.3, anioDelMin: 2020 })).toBeNull();
  });
  it("un año con las tiendas casi cerradas dice sus dos decimales: «×0.04», no «×0.0»", () => {
    expect(multiplicadorLegible(0.04)).toBe("×0.04");
    expect(multiplicadorLegible(0.09)).toBe("×0.09");
    expect(multiplicadorLegible(0.1)).toBe("×0.1");
    expect(multiplicadorLegible(1.14)).toBe("×1.1");
    expect(multiplicadorLegible(0)).toBe("×0.0");
    const base = { max: 1.4, anioDelMax: 2022, porAnio: [1, 2, 3, 4].map((i) => ({ anio: 2017 + i, multiplicador: 1.2 })) };
    expect(notaDelAnioRaro({ ...base, mediana: 1.2, min: 0.04, anioDelMin: 2020 })).toMatch(/^El ×0\.04 es de 2020/);
  });
  it("la barra va de ×0,5 a ×3 y no se sale", () => {
    expect(posicionEnLaEscala(0.5)).toBe(0);
    expect(posicionEnLaEscala(1)).toBeCloseTo(20, 6);
    expect(posicionEnLaEscala(3)).toBe(100);
    expect(posicionEnLaEscala(0.1)).toBe(0);
    expect(posicionEnLaEscala(9)).toBe(100);
  });
});

describe("cómo se lee la historia: varias llamadas, una sola lectura", () => {
  it("las ventanas cubren todo el rango sin encimarse, de la más nueva a la más vieja, y ninguna pasa de lo que deja la base", () => {
    for (const [desde, hasta] of [["2017-09-01", "2026-10-26"], ["2026-01-01", "2026-10-26"], ["2026-10-26", "2026-10-26"], ["2023-03-01", "2026-02-27"]] as const) {
      const v = ventanasDeLectura(desde, hasta);
      expect(v[0].hasta).toBe(hasta);
      expect(v[v.length - 1].desde).toBe(desde);
      for (const w of v) expect(diasEntre(w.desde, w.hasta)).toBeLessThanOrEqual(DIAS_POR_LECTURA - 1);
      for (let i = 1; i < v.length; i++) expect(sumarDias(v[i].hasta, 1)).toBe(v[i - 1].desde);
      expect(v.reduce((s, w) => s + diasEntre(w.desde, w.hasta) + 1, 0)).toBe(diasEntre(desde, hasta) + 1);
      for (const w of v) expect(diasEntre(w.desde, w.hasta)).toBeLessThan(1200);
    }
    expect(ventanasDeLectura("2026-10-27", "2026-10-26")).toEqual([]);
    expect(ventanasDeLectura("2017-09-01", "2026-10-26").length).toBe(3);
  });
  it("unir las lecturas junta los días de cada tienda y deja las tiendas y los meses de la primera", () => {
    const mk = (hoy: string, dias: [string, number][]): LecturaHistorial => ({ hoy, tiendas: [TRU], meses: new Map([["tru", new Map([["2026-01", 10]])]]), dias: new Map([["tru", new Map(dias)]]) });
    const u = unirHistoriales([mk("2026-10-26", [["2026-10-25", 5]]), mk("2026-10-26", [["2024-01-01", 7], ["2026-10-25", 5]])])!;
    expect([...u.dias.get("tru")!.entries()].sort()).toEqual([["2024-01-01", 7], ["2026-10-25", 5]]);
    expect(u.tiendas).toEqual([TRU]);
    expect(u.hoy).toBe("2026-10-26");
    expect(unirHistoriales([])).toBeNull();
    // Medir con la lectura unida da lo mismo que con una sola: la unión no cambia la cuenta.
    const un = historia(TRU, "2026-10-26", navidad, () => 2);
    const mitad = (desde: string, hasta: string): LecturaHistorial => ({ hoy: un.hoy, tiendas: [TRU], meses: new Map(), dias: new Map([["tru", new Map([...un.dias.get("tru")!].filter(([f]) => f >= desde && f <= hasta))]]) });
    const unida = unirHistoriales([mitad("2022-01-01", "2026-10-26"), mitad("2017-09-01", "2021-12-31")])!;
    expect(evidenciaDeCampana(unida, TRU, navidad, aniosAMedir(TRU, un.hoy))).toEqual(evidenciaDeCampana(un, TRU, navidad, aniosAMedir(TRU, un.hoy)));
  });
  it("un año bisiesto no descuadra las fechas de una campaña (el 29 de febrero)", () => {
    expect(mismaFechaEn("2024-02-29", 2025)).toBe("2025-02-28");
  });
});
