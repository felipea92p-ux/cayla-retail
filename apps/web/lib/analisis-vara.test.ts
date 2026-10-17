import { describe, expect, it } from "vitest";
import type { VaraCategoria } from "./frescura-reglas";
import type { PrendaAnalisis } from "./analisis-tipos";
import { conSinRitmo, conUmbrales, sinRitmoDeVara, sinRitmoPorTipo, umbralesDeVara, umbralesPorTipo } from "./analisis-vara";
import { grupoDe } from "./analisis-reglas";

// Datos inventados (el repo es público): categorías, ventas y cortes de mentira. Los cortes de Frescura vienen en segundos.
const DIA = 86_400;
type Base = Omit<VaraCategoria, "respaldo" | "delMes">;
const base = (cortes: { p75: number | null; p90: number | null }, vendidas: number): Base => ({
  categoriaId: "cat",
  categoriaNombre: "Polos",
  ventanaDias: 30,
  cortes: { p50: 1 * DIA, ...cortes },
  tMax: 20 * DIA,
  vendidoAlFinal: 0.95,
  vendidas,
  unidades: vendidas + 5,
  nivel: vendidas >= 10 ? "aceptable" : "pocos_datos",
});
function vara(p: { hoy: Base; mes?: (Base & { corte: string; enUso: boolean }) | null; cayla?: (Base & { calculadaEn: string; enUso: boolean }) | null; nombre?: string }): VaraCategoria {
  return { ...p.hoy, categoriaNombre: p.nombre ?? p.hoy.categoriaNombre, respaldo: p.cayla ?? null, delMes: p.mes ?? null };
}

describe("los escalones de un tipo salen de la vara que juzgó (la de Frescura)", () => {
  it("vigilar desde p75 y liquidar desde p90, en días (como los dice Frescura: nunca 0)", () => {
    expect(umbralesDeVara(vara({ hoy: base({ p75: 3.4 * DIA, p90: 6.6 * DIA }, 25) }))).toEqual({ vigila: 3, liquidar: 7, vara: "hoy", vendidas: 25 });
    expect(umbralesDeVara(vara({ hoy: base({ p75: 0.2 * DIA, p90: 0.4 * DIA }, 25) }))).toMatchObject({ vigila: 1, liquidar: 1 });
  });

  it("la del mes manda si está en uso; si no, la de CAYLA si está en uso; si no, la de hoy (la cascada de Frescura)", () => {
    const mes = { ...base({ p75: 5 * DIA, p90: 9 * DIA }, 14), corte: "2026-10-01", enUso: true };
    const cayla = { ...base({ p75: 4 * DIA, p90: 8 * DIA }, 40), calculadaEn: "2026-10-13", enUso: true };
    const hoy = base({ p75: 2 * DIA, p90: 3 * DIA }, 4);
    expect(umbralesDeVara(vara({ hoy, mes, cayla }))).toMatchObject({ liquidar: 9, vara: "mes" });
    expect(umbralesDeVara(vara({ hoy, mes: { ...mes, enUso: false }, cayla }))).toMatchObject({ liquidar: 8, vara: "cayla" });
  });

  it("sin las ventas con que Frescura juzga sola (10), no hay escalones (y tampoco un número de respaldo: queda «sin ritmo»)", () => {
    // 4 ventas rápidas: p90 de 3 días haría «liquidar» todo lo colgado hace 3.
    expect(umbralesDeVara(vara({ hoy: base({ p75: 2 * DIA, p90: 3 * DIA }, 4) }))).toBeNull();
    expect(umbralesDeVara(vara({ hoy: base({ p75: 2 * DIA, p90: 3 * DIA }, 9.5) }))).toBeNull();
    expect(umbralesDeVara(vara({ hoy: base({ p75: 2 * DIA, p90: 3 * DIA }, 10) }))).not.toBeNull();
  });

  it("si la curva no llega a 9 de cada 10 (p90 nulo), tampoco", () => {
    expect(umbralesDeVara(vara({ hoy: base({ p75: 4 * DIA, p90: null }, 30) }))).toBeNull();
  });

  it("por nombre de tipo, solo los que alcanzan; y cada talla toma los de su tipo", () => {
    const porTipo = umbralesPorTipo([
      vara({ nombre: "Polos", hoy: base({ p75: 3 * DIA, p90: 5 * DIA }, 30) }),
      vara({ nombre: "Faldas ", hoy: base({ p75: 6 * DIA, p90: 10 * DIA }, 12) }),
      vara({ nombre: "Gorros", hoy: base({ p75: 1 * DIA, p90: 2 * DIA }, 3) }),
    ]);
    expect([...porTipo.keys()]).toEqual(["Polos", "Faldas"]);
    const tallas = conUmbrales([{ categoria: "Faldas" }, { categoria: "Gorros" }, { categoria: null }], porTipo);
    expect(tallas[0]).toMatchObject({ umbrales: { vigila: 6, liquidar: 10 } });
    expect("umbrales" in tallas[1]).toBe(false);
    expect("umbrales" in tallas[2]).toBe(false);
  });
});

describe("el grupo con los escalones de su tipo (ADR-0357, act. 2026-10-14; B1, 2026-10-17)", () => {
  const quieta = (dias: number, extra: Partial<PrendaAnalisis> = {}) =>
    ({ piso: 2, almacen: 1, vendidas30: 0, diasSinVender: dias, otras: [], varianteId: "v1", ...extra }) as Pick<
      PrendaAnalisis,
      "varianteId" | "piso" | "almacen" | "vendidas30" | "diasSinVender" | "otras" | "diasDeVentas" | "enDuda" | "umbrales" | "sinRitmo"
    >;
  const polos = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };

  it("se liquida desde el p90 de su tipo (antes, con un número fijo de 15 días, nada se señalaba)", () => {
    expect(grupoDe(quieta(6, { umbrales: polos }))).toBe("liquidar");
    expect(grupoDe(quieta(5, { umbrales: polos }))).toBe("liquidar");
    expect(grupoDe(quieta(4, { umbrales: polos }))).toBe("vigila");
  });

  it("sin la vara de su tipo no hay número de respaldo: ni se liquida ni se vigila", () => {
    expect(grupoDe(quieta(6))).toBeNull();
    expect(grupoDe(quieta(40))).toBeNull();
    expect(grupoDe(quieta(400))).toBeNull();
  });

  it("«Vigílalas» vuelve: entre el p75 y el p90 de su tipo", () => {
    expect(grupoDe(quieta(4, { umbrales: polos }))).toBe("vigila");
    expect(grupoDe(quieta(2, { umbrales: polos }))).toBeNull();
  });

  it("la duda (una venta sin registrar) sigue frenando, con los escalones de su tipo", () => {
    expect(grupoDe(quieta(6, { umbrales: polos, enDuda: 1 }))).toBe("duda");
    expect(grupoDe(quieta(2, { umbrales: polos, enDuda: 1 }))).toBeNull();
  });
});

describe("un tipo SIN vara suficiente: «Todavía sin ritmo» (B1, 2026-10-17)", () => {
  /** Jeans con 7 de 35 vendidos: no llegó a la mitad (sin P50), la última venta tardó 6 días. */
  const jeans = (extra: Partial<Base> = {}) =>
    vara({ nombre: "Jeans", hoy: { ...base({ p75: null, p90: null }, 7), cortes: { p50: null, p75: null, p90: null }, unidades: 35, ultimaVentaSeg: 6 * DIA, tMax: 11 * DIA, ...extra } });

  it("con la mitad vendida (P50), un modelo se rotula desde lo que tardó la mitad de su tipo", () => {
    const v = vara({ nombre: "Faldas", hoy: { ...base({ p75: null, p90: null }, 7), cortes: { p50: 4.4 * DIA, p75: null, p90: null }, unidades: 20, ultimaVentaSeg: 9 * DIA } });
    expect(sinRitmoDeVara(v)).toEqual({ motivo: "poca_venta", desde: 4, vendidas: 7, unidades: 20 });
  });

  it("sin P50 (ni la mitad se vendió), desde lo que tardó la última venta vista de su tipo — nunca desde un número fijo", () => {
    expect(sinRitmoDeVara(jeans())).toEqual({ motivo: "poca_venta", desde: 6, vendidas: 7, unidades: 35 });
    // Sin la última venta vista (la lectura no la trae), no hay con qué comparar: no se rotula ningún modelo.
    expect(sinRitmoDeVara(jeans({ ultimaVentaSeg: null }))).toMatchObject({ desde: null });
    expect(sinRitmoDeVara(jeans({ ultimaVentaSeg: undefined }))).toMatchObject({ desde: null });
  });

  it("la venta más lenta vista de 0 segundos igual rotula (desde 1 día), no deja el modelo sin rotular", () => {
    expect(sinRitmoDeVara(jeans({ ultimaVentaSeg: 0 }))).toMatchObject({ desde: 1 });
  });

  it("un tipo que no vendió nada no tiene con qué compararse: no es «sin ritmo» sino nada (no se rotula)", () => {
    expect(sinRitmoDeVara(jeans({ vendidas: 0 }))).toBeNull();
  });

  it("un tipo con vara suficiente no es «sin ritmo»", () => {
    expect(sinRitmoDeVara(vara({ hoy: base({ p75: 3 * DIA, p90: 5 * DIA }, 25) }))).toBeNull();
  });

  it("con 10 ventas pero sin P75 o P90 calculables (Conjuntos) también queda sin ritmo, con su P50 si lo tiene", () => {
    const conjuntos = vara({ nombre: "Conjuntos", hoy: { ...base({ p75: null, p90: null }, 15), cortes: { p50: 8 * DIA, p75: null, p90: null }, unidades: 40 } });
    expect(sinRitmoDeVara(conjuntos)).toEqual({ motivo: "poca_venta", desde: 8, vendidas: 15, unidades: 40 });
  });

  it("usa la misma vara que juzgó (la del mes o la de CAYLA), no la de hoy", () => {
    const mes = { ...base({ p75: null, p90: null }, 6), cortes: { p50: null, p75: null, p90: null }, unidades: 30, ultimaVentaSeg: 12 * DIA, corte: "2026-10-01", enUso: true };
    const hoy = base({ p75: null, p90: null }, 2);
    expect(sinRitmoDeVara(vara({ hoy, mes }))).toEqual({ motivo: "poca_venta", desde: 12, vendidas: 6, unidades: 30 });
  });

  it("por tipo: solo los que no alcanzan y vendieron algo; Polos (con vara) y Gorros (sin ventas) no entran", () => {
    const porTipo = sinRitmoPorTipo([vara({ nombre: "Polos", hoy: base({ p75: 3 * DIA, p90: 5 * DIA }, 30) }), jeans(), vara({ nombre: "Gorros", hoy: { ...base({ p75: null, p90: null }, 0), cortes: { p50: null, p75: null, p90: null } } })]);
    expect([...porTipo.keys()]).toEqual(["Jeans"]);
  });

  describe("a cada talla, su razón", () => {
    const porTipo = sinRitmoPorTipo([jeans()]);
    const polosConVara = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };
    it("Frescura leída: el tipo que vendió poco recibe su razón; el que tiene vara y el que no vendió nada, no", () => {
      const t = conSinRitmo([{ categoria: "Jeans" }, { categoria: "Polos", umbrales: polosConVara }, { categoria: "Gorros" }, { categoria: null }], porTipo, "ok");
      expect(t[0]).toMatchObject({ sinRitmo: { motivo: "poca_venta", desde: 6 } });
      expect("sinRitmo" in t[1]).toBe(false);
      expect("sinRitmo" in t[2]).toBe(false);
      expect("sinRitmo" in t[3]).toBe(false);
    });
    it("una prenda sin categoría también cruza con la vara de «Sin categoría» (no se pierde en silencio)", () => {
      const sinCat = sinRitmoPorTipo([vara({ nombre: "Sin categoría", hoy: { ...base({ p75: null, p90: null }, 7), cortes: { p50: 3 * DIA, p75: null, p90: null }, unidades: 20 } })]);
      expect(conSinRitmo([{ categoria: null }], sinCat, "ok")[0]).toMatchObject({ sinRitmo: { desde: 3 } });
      const u = umbralesPorTipo([vara({ nombre: "Sin categoría", hoy: base({ p75: 5 * DIA, p90: 9 * DIA }, 30) })]);
      expect(conUmbrales([{ categoria: null }, { categoria: "  " }], u)[1]).toMatchObject({ umbrales: { liquidar: 9 } });
    });
    it("sin leer Frescura (sin módulo, falló, la sede no separa piso): TODA talla sin vara queda sin ritmo, con el motivo", () => {
      for (const estado of ["sin_modulo", "fallo", "no_aplica"] as const) {
        const t = conSinRitmo([{ categoria: "Jeans" }, { categoria: "Gorros" }, { categoria: "Polos", umbrales: polosConVara }], new Map(), estado);
        expect(t[0]).toMatchObject({ sinRitmo: { motivo: "sin_lectura", porque: estado } });
        expect(t[1]).toMatchObject({ sinRitmo: { motivo: "sin_lectura", porque: estado } });
        expect("sinRitmo" in t[2]).toBe(false);
      }
    });
  });

  it("de punta a punta: Polos contra Jeans con los números de hoy (Polos P75 13 y P90 22; Jeans sin vara)", () => {
    const polos = vara({ nombre: "Polos", hoy: base({ p75: 13 * DIA, p90: 22 * DIA }, 47) });
    const todas = [polos, jeans()];
    const u = umbralesPorTipo(todas);
    const s = sinRitmoPorTipo(todas);
    const pieza = (categoria: string, dias: number) => ({ categoria, varianteId: `v-${categoria}`, piso: 2, almacen: 1, vendidas30: 0, diasSinVender: dias, otras: [] });
    const [polo, jean] = conSinRitmo(conUmbrales([pieza("Polos", 15), pieza("Jeans", 15)], u), s, "ok");
    // 15 días quieto: el polo ya pasó su P75 (13) y se vigila; el jean no se vigila ni se liquida: ya pasó la última venta de su tipo (6) y queda sin ritmo.
    expect(grupoDe(polo!)).toBe("vigila");
    expect(grupoDe(jean!)).toBe("sin_ritmo");
    const [polo2, jean2] = conSinRitmo(conUmbrales([pieza("Polos", 25), pieza("Jeans", 25)], u), s, "ok");
    expect(grupoDe(polo2!)).toBe("liquidar");
    expect(grupoDe(jean2!)).toBe("sin_ritmo");
  });
});
