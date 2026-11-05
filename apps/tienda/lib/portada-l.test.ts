import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { categoriasConFoto, dondeDelGrupo, fraseDelGrupo, GRUPOS_DE_PORTADA, gruposDeLaPortada, prendasDeAbajo } from "./portada-l";
import type { Nivel } from "./stock";

const AQP = { id: "a", nombre: "Arequipa" };
const LIM = { id: "l", nombre: "Lima" };
const TRU = { id: "t", nombre: "Trujillo" };
const TIENDAS = [AQP, LIM, TRU];

function prenda(codigo: string, sedes: Partial<Record<"a" | "l" | "t", Nivel>>, extra: Partial<Prenda> = {}): Prenda {
  const prefijo = codigo.split("-")[0];
  return {
    id: codigo,
    codigo,
    nombre: `Prenda ${codigo}`,
    categoria: { nombre: prefijo, prefijo },
    precio: 50,
    precioFinal: 50,
    colores: [{ codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null }],
    fotos: [`https://x.co/${codigo}.png`],
    stock: { total: "hay", sedes },
    nuevo: { dias: 3 },
    ...extra,
  } as Prenda;
}
const grupo = (fondo: string, ...codigos: [string, string, string]) =>
  codigos.map((codigo) => ({ codigo, fondo, texto: "#fff" })) as unknown as (typeof GRUPOS_DE_PORTADA)[number];

const G1 = grupo("#111111", "A-1", "B-1", "C-1");
const G2 = grupo("#222222", "A-2", "B-2", "C-2");
const enArequipa = ["A-1", "B-1", "C-1"].map((c) => prenda(c, { a: "hay" }));
const enTrujillo = ["A-2", "B-2", "C-2"].map((c) => prenda(c, { t: 2 }));

describe("los grupos que salen en la portada", () => {
  it("con una tienda elegida, solo los que están completos en ella, y no repite su nombre", () => {
    const [g, ...resto] = gruposDeLaPortada([...enArequipa, ...enTrujillo], TRU, TIENDAS, "trujillo", [G1, G2]);
    expect(resto).toEqual([]);
    expect(g.prendas.map((p) => p.id)).toEqual(["A-2", "B-2", "C-2"]);
    expect(g.combinan).toBe(true);
    expect(g.donde).toEqual([]);
    expect(fraseDelGrupo(g)).toBe("Estas tres combinan.");
    expect(dondeDelGrupo(g)).toBe("Este outfit");
  });

  it("con «Todas», salen los que se pueden recoger juntos, y dice dónde", () => {
    const grupos = gruposDeLaPortada([...enArequipa, ...enTrujillo], null, TIENDAS, null, [G1, G2]);
    expect(grupos.map((g) => g.donde)).toEqual([["Arequipa"], ["Trujillo"]]);
    expect(fraseDelGrupo(grupos[0])).toBe("Estas tres combinan y hay en Arequipa.");
    expect(dondeDelGrupo(grupos[1])).toBe("Este outfit, en Trujillo");
  });

  it("una prenda agotada o que ya no está saca al grupo entero", () => {
    const agotada = [prenda("A-1", { a: 0 }), prenda("B-1", { a: "hay" }), prenda("C-1", { a: "hay" })];
    expect(gruposDeLaPortada(agotada, AQP, TIENDAS, null, [G1]).every((g) => !g.combinan)).toBe(true);
    const falta = enArequipa.slice(0, 2);
    expect(gruposDeLaPortada(falta, AQP, TIENDAS, null, [G1]).every((g) => !g.combinan)).toBe(true);
  });

  it("repartidas en tiendas distintas no combinan: no se pueden recoger juntas", () => {
    const repartidas = [prenda("A-1", { a: "hay" }), prenda("B-1", { t: "hay" }), prenda("C-1", { l: "hay" })];
    expect(gruposDeLaPortada(repartidas, null, TIENDAS, null, [G1]).some((g) => g.combinan)).toBe(false);
  });

  it("una prenda sin foto saca al grupo", () => {
    const sinFoto = [prenda("A-1", { a: "hay" }, { fotos: [] }), prenda("B-1", { a: "hay" }), prenda("C-1", { a: "hay" })];
    expect(gruposDeLaPortada(sinFoto, AQP, TIENDAS, null, [G1]).some((g) => g.combinan)).toBe(false);
  });

  it("nunca salen más de tres grupos", () => {
    const muchos = [1, 2, 3, 4].map((n) => grupo("#333333", `A-${n}`, `B-${n}`, `C-${n}`));
    const prendas = [1, 2, 3, 4].flatMap((n) => [`A-${n}`, `B-${n}`, `C-${n}`].map((c) => prenda(c, { a: "hay" })));
    expect(gruposDeLaPortada(prendas, AQP, TIENDAS, null, muchos)).toHaveLength(3);
  });

  it("suma lo que paga el cliente, con la campaña si la hay", () => {
    const conOferta = [prenda("A-1", { a: "hay" }, { precioFinal: 40 }), prenda("B-1", { a: "hay" }), prenda("C-1", { a: "hay" })];
    expect(gruposDeLaPortada(conOferta, AQP, TIENDAS, null, [G1])[0].total).toContain("140");
  });
});

describe("sin grupos completos, como en Lima", () => {
  const tops = ["TOP-1", "TOP-2", "CMS-1", "POL-1"].map((c) => prenda(c, { l: "hay" }));

  it("salen tres prendas nuevas sueltas, de tipos distintos, sin decir que combinan ni sumar", () => {
    const [g, ...resto] = gruposDeLaPortada(tops, LIM, TIENDAS, "lima", [G1]);
    expect(resto).toEqual([]);
    expect(g.combinan).toBe(false);
    expect(g.total).toBeNull();
    expect(g.prendas.map((p) => p.id)).toEqual(["TOP-1", "CMS-1", "POL-1"]);
    expect(fraseDelGrupo(g)).toBe("Lo último que llegó.");
  });

  it("no usa una prenda blanca: se confunde con el fondo de su foto", () => {
    const blanca = prenda("POL-9", { l: "hay" }, { colores: [{ codigo: "BLA", nombre: "Blanco", hex: "#ffffff", foto: null }] });
    const [g] = gruposDeLaPortada([blanca, ...tops], LIM, TIENDAS, null, [G1]);
    expect(g.prendas.map((p) => p.id)).not.toContain("POL-9");
  });

  it("con menos de tres, no hay portada nueva: sigue la de siempre", () => {
    expect(gruposDeLaPortada(tops.slice(0, 2), LIM, TIENDAS, null, [G1])).toEqual([]);
    expect(gruposDeLaPortada([], null, TIENDAS, null)).toEqual([]);
  });
});

describe("los grupos elegidos", () => {
  it("ninguna prenda se repite entre grupos, y cada uno tiene tres", () => {
    const codigos = GRUPOS_DE_PORTADA.flat().map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const g of GRUPOS_DE_PORTADA) expect(g).toHaveLength(3);
  });

  it("todo fondo y todo texto son colores escritos completos", () => {
    for (const p of GRUPOS_DE_PORTADA.flat()) {
      expect(p.fondo).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.texto).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("debajo de la portada", () => {
  it("cada categoría muestra su prenda más vendida con foto", () => {
    const lista = [prenda("TOP-1", { a: "hay" }), prenda("TOP-2", { a: "hay" }, { vendidos: 3 }), prenda("TOP-3", { a: "hay" }, { fotos: [], vendidos: 1 })];
    const [c, ...resto] = categoriasConFoto(lista);
    expect(resto).toEqual([]);
    expect(c.foto).toContain("TOP-2");
    expect(c.nombre).toBe("TOP");
  });

  it("una categoría sin ninguna foto no sale", () => {
    expect(categoriasConFoto([prenda("TOP-1", { a: "hay" }, { fotos: [] })])).toEqual([]);
  });

  it("sin puesto en ventas, la que llegó hace menos", () => {
    const lista = [prenda("TOP-1", { a: "hay" }, { nuevo: { dias: 20 } }), prenda("TOP-2", { a: "hay" }, { nuevo: { dias: 2 } })];
    expect(categoriasConFoto(lista)[0].foto).toContain("TOP-2");
  });

  it("las prendas son las de la portada primero, sin repetir, y hasta nueve", () => {
    const portada = gruposDeLaPortada(enArequipa, AQP, TIENDAS, null, [G1]);
    const otras = Array.from({ length: 12 }, (_, i) => prenda(`POL-${i}`, { a: "hay" }));
    const lista = prendasDeAbajo([...enArequipa, ...otras], portada);
    expect(lista).toHaveLength(9);
    expect(lista.slice(0, 3).map((p) => p.id)).toEqual(["A-1", "B-1", "C-1"]);
    expect(new Set(lista.map((p) => p.id)).size).toBe(9);
  });
});
