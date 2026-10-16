import { describe, expect, it } from "vitest";
import type { VaraCategoria } from "./frescura-reglas";
import type { PrendaAnalisis } from "./analisis-tipos";
import { conUmbrales, umbralesDeVara, umbralesPorTipo } from "./analisis-vara";
import { grupoDe, umbralLiquidar, umbralVigilar } from "./analisis-reglas";

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

  it("sin las ventas con que Frescura juzga sola (10), no hay escalones: manda «Liquidar desde»", () => {
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

describe("el grupo con los escalones de su tipo (ADR-0357, act. 2026-10-14)", () => {
  const quieta = (dias: number, extra: Partial<PrendaAnalisis> = {}) =>
    ({ piso: 2, almacen: 1, vendidas30: 0, diasSinVender: dias, otras: [], ...extra }) as Pick<
      PrendaAnalisis,
      "piso" | "almacen" | "vendidas30" | "diasSinVender" | "otras" | "diasDeVentas" | "enDuda" | "umbrales"
    >;
  const polos = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };

  it("se liquida desde el p90 de su tipo, aunque «Liquidar desde» sea 15 (antes: nada se señalaba)", () => {
    expect(grupoDe(quieta(6, { umbrales: polos }), 15)).toBe("liquidar");
    expect(grupoDe(quieta(6), 15)).toBeNull();
  });

  it("«Vigílalas» vuelve: entre el p75 y el p90 de su tipo", () => {
    expect(grupoDe(quieta(4, { umbrales: polos }), 15)).toBe("vigila");
    expect(grupoDe(quieta(2, { umbrales: polos }), 15)).toBeNull();
  });

  it("sin escalones de su tipo, «Liquidar desde» y un mes, como siempre (con 15, «Vigílalas» no tiene lugar)", () => {
    expect(grupoDe(quieta(16), 15)).toBe("liquidar");
    expect(grupoDe(quieta(40), 60)).toBe("vigila");
    expect(umbralLiquidar({}, 15)).toBe(15);
    expect(umbralVigilar({})).toBe(30);
    expect(umbralLiquidar({ umbrales: polos }, 15)).toBe(5);
    expect(umbralVigilar({ umbrales: polos })).toBe(3);
  });

  it("la duda (una venta sin registrar) sigue frenando, con los escalones de su tipo", () => {
    expect(grupoDe(quieta(6, { umbrales: polos, enDuda: 1 }), 15)).toBe("duda");
    expect(grupoDe(quieta(2, { umbrales: polos, enDuda: 1 }), 15)).toBeNull();
  });
});
