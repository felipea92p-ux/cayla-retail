import { describe, expect, it } from "vitest";
import {
  campanaParaResultados,
  coloresQueMasVendieron,
  diasMedidos,
  leerResultados,
  momentoDeResultados,
  multiplicadorReal,
  porCategoria,
  porFamilia,
  prendasQueMasVendieron,
  recuperoRealTotal,
  type LecturaResultados,
} from "./plan-compra-resultados";

const CRUDO = {
  plan: { id: "p", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25" },
  hoy: "2027-01-20",
  medido_hasta: "2026-12-25",
  tiendas: [
    { id: "tru", nombre: "Tienda TRU", unidades: 300, soles: "24000", base_unidades: 600 },
    { id: "aqp", nombre: "Tienda AQP", unidades: 60, soles: 4800, base_unidades: null },
  ],
  filas: [
    { u: "tru", c: "polos", p: "p1", color: "negro", unidades: 200, soles: 16000 },
    { u: "tru", c: "polos", p: "p1", color: "blanco", unidades: 50, soles: 4000 },
    { u: "tru", c: "jeans", p: "p2", color: "negro", unidades: 50, soles: 4000 },
    { u: "aqp", c: "polos", p: null, color: "rojo", unidades: 60, soles: 4800 },
  ],
  agotadas: [{ u: "tru", c: "polos" }],
  despues: { hasta: "2027-01-19", categorias: [{ c: "polos", unidades: 40, soles: 1600, a_precio_lista: 3200 }] },
  lineas: [
    { c: "polos", flojo: 150, normal: 250, bueno: 450, recupero_pct: 40 },
    { c: "casacas", flojo: 10, normal: 20, bueno: 30, recupero_pct: 60 },
  ],
  categorias: [
    { id: "polos", nombre: "Polos", familia: "ind" },
    { id: "jeans", nombre: "Jeans", familia: "ind" },
    { id: "casacas", nombre: "Casacas", familia: "abr" },
  ],
  familias: [{ codigo: "ind", nombre: "Indumentaria" }, { codigo: "abr", nombre: "Abrigos" }],
  productos: [{ id: "p1", nombre: "Polo Aurora" }, { id: "p2", nombre: "Jean Recto" }],
  colores: [{ codigo: "negro", nombre: "Negro", hex: "#1a1a18" }, { codigo: "blanco", nombre: "Blanco", hex: null }, { codigo: "rojo", nombre: "Rojo", hex: null }],
};
const r = leerResultados(CRUDO) as LecturaResultados;

describe("leer y el momento", () => {
  it("lee la forma de la base; null si no se entiende", () => {
    expect(r.tiendas.map((t) => [t.id, t.soles, t.baseUnidades])).toEqual([
      ["tru", 24000, 600],
      ["aqp", 4800, null],
    ]);
    expect(leerResultados({ plan: {} })).toBeNull();
  });
  it("por venir, en curso o terminada según hoy", () => {
    expect(momentoDeResultados(r)).toBe("terminada");
    expect(momentoDeResultados({ ...r, hoy: "2026-12-15" })).toBe("en-curso");
    expect(momentoDeResultados({ ...r, hoy: "2026-12-11" })).toBe("por-venir");
  });
});

describe("el multiplicador real de cada tienda", () => {
  it("unidades por día en la campaña ÷ unidades por día en los 60 de antes (300/15 ÷ 600/60 = 2)", () => {
    expect(diasMedidos(r)).toBe(15);
    expect(multiplicadorReal(r, r.tiendas[0])).toBe(2);
  });
  it("sin los 60 días de antes en el ERP, no se inventa", () => {
    expect(multiplicadorReal(r, r.tiendas[1])).toBeNull();
  });
});

describe("por categoría, familia, prenda y color", () => {
  it("una fila por categoría vendida o con plan, con su lectura contra el plan, dónde se agotó y lo que sobró", () => {
    const filas = porCategoria(r, null);
    expect(filas.map((f) => [f.nombre, f.unidades, f.lectura, f.agotadaEn, f.recuperoReal])).toEqual([
      ["Polos", 310, "Se vendieron 310: entre el normal y el bueno.", ["Tienda TRU"], 50],
      ["Jeans", 50, null, [], null],
      ["Casacas", 0, "Se vendieron 0: menos que el flojo.", [], null],
    ]);
  });
  it("filtrar por tienda cuenta solo lo suyo y no compara contra el plan (que es de toda CAYLA)", () => {
    const aqp = porCategoria(r, "aqp");
    expect(aqp.find((f) => f.id === "polos")).toMatchObject({ unidades: 60, lectura: null, agotadaEn: [] });
  });
  it("las familias, de la que más vendió a la que menos", () => {
    expect(porFamilia(r, null)).toEqual([{ familia: "Indumentaria", unidades: 360, soles: 28800 }]);
  });
  it("las prendas que más vendieron, con su color; lo anotado sin registrar dice su categoría", () => {
    expect(prendasQueMasVendieron(r, null).map((p) => [p.prenda, p.color, p.unidades])).toEqual([
      ["Polo Aurora", "Negro", 200],
      ["Sin registrar · Polos", "Rojo", 60],
      // Empate en unidades y soles: por nombre.
      ["Jean Recto", "Negro", 50],
      ["Polo Aurora", "Blanco", 50],
    ]);
  });
  it("los colores que más vendieron", () => {
    expect(coloresQueMasVendieron(r, null).map((c) => [c.nombre, c.unidades])).toEqual([
      ["Negro", 250],
      ["Rojo", 60],
      ["Blanco", 50],
    ]);
  });
  it("lo que sobró de toda la campaña: lo cobrado ÷ lo que valía", () => {
    expect(recuperoRealTotal(r)).toBe(50);
    expect(recuperoRealTotal({ ...r, despues: { hasta: null, categorias: [] } })).toBeNull();
  });
});

describe("qué campaña se muestra", () => {
  const c = (id: string, desde: string, hasta: string, archivado = false) => ({ id, desde, hasta, archivado });
  it("la que está en curso; si no, la última terminada; si no, la próxima; nunca una archivada", () => {
    const planes = [c("madre", "2026-04-26", "2026-05-10"), c("dic", "2026-12-01", "2026-12-31"), c("hall", "2026-10-17", "2026-10-31")];
    expect(campanaParaResultados(planes, "2026-10-20")?.id).toBe("hall");
    expect(campanaParaResultados(planes, "2026-11-10")?.id).toBe("hall");
    expect(campanaParaResultados([c("dic", "2026-12-01", "2026-12-31")], "2026-10-12")?.id).toBe("dic");
    expect(campanaParaResultados([c("x", "2026-01-01", "2026-01-10", true)], "2026-10-12")).toBeNull();
  });
});
