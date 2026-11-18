import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { categoriasConFoto, gruposDeLaPortada } from "./portada-l";

/** `codigo` es «CAT-n»; el orden en que se pasan no importa: manda `dias`. */
function prenda(codigo: string, dias: number | null, extra: Partial<Prenda> = {}): Prenda {
  const prefijo = codigo.split("-")[0];
  return {
    id: codigo,
    codigo,
    nombre: `Prenda ${codigo}`,
    categoria: { nombre: prefijo, prefijo },
    precio: 50,
    precioFinal: 50,
    colores: [{ codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: null }],
    fotos: [`https://x.co/${codigo}.png`],
    stock: { total: "hay", sedes: {} },
    nuevo: { dias },
    ...extra,
  } as Prenda;
}
const ids = (grupos: ReturnType<typeof gruposDeLaPortada>) => grupos.map((g) => g.prendas.map((p) => p.id));

describe("las últimas prendas de tres categorías", () => {
  it("toma las tres categorías con lo más reciente, y de cada una, de la última a la antepenúltima", () => {
    const lista = [
      prenda("POL-3", 9), prenda("POL-1", 1), prenda("POL-2", 5), prenda("POL-4", 20),
      prenda("PAN-1", 2), prenda("PAN-2", 6), prenda("PAN-3", 10),
      prenda("TOP-1", 3), prenda("TOP-2", 7), prenda("TOP-3", 11),
      prenda("FAL-1", 4), prenda("FAL-2", 8), prenda("FAL-3", 12),
    ];
    expect(ids(gruposDeLaPortada(lista, null))).toEqual([
      ["POL-1", "PAN-1", "TOP-1"],
      ["POL-2", "PAN-2", "TOP-2"],
      ["POL-3", "PAN-3", "TOP-3"],
    ]);
  });

  it("sin foto no entra, y la que sigue ocupa su lugar", () => {
    const lista = [prenda("POL-1", 1, { fotos: [] }), prenda("POL-2", 5), prenda("PAN-1", 2), prenda("TOP-1", 3)];
    expect(ids(gruposDeLaPortada(lista, null))[0]).toEqual(["PAN-1", "TOP-1", "POL-2"]);
  });

  it("lo que ya no es nuevo no entra", () => {
    const lista = [prenda("POL-1", 1, { nuevo: null }), prenda("POL-2", 5), prenda("PAN-1", 2), prenda("TOP-1", 3)];
    expect(gruposDeLaPortada(lista, null).flatMap((g) => g.prendas.map((p) => p.id))).not.toContain("POL-1");
  });

  it("una prenda fijada como nueva, sin días, entra al final", () => {
    const lista = [prenda("POL-1", null), prenda("PAN-1", 2), prenda("TOP-1", 3)];
    expect(ids(gruposDeLaPortada(lista, null))[0]).toEqual(["PAN-1", "TOP-1", "POL-1"]);
  });

  it("una prenda blanca no entra: no se puede recortar de su foto", () => {
    const blanca = { colores: [{ codigo: "BLA", nombre: "Blanco", hex: "#ffffff", foto: null }] };
    const lista = [prenda("POL-1", 1, blanca), prenda("POL-2", 5), prenda("PAN-1", 2), prenda("TOP-1", 3)];
    expect(ids(gruposDeLaPortada(lista, null))[0]).toEqual(["PAN-1", "TOP-1", "POL-2"]);
  });

  it("si una categoría se queda sin prendas, entra la que sigue, sin repetir ninguna (como Lima)", () => {
    const lista = [prenda("CMS-1", 6), prenda("CMS-2", 20), prenda("POL-1", 12), prenda("CON-1", 13), prenda("TOP-1", 22), prenda("TOP-2", 23)];
    const grupos = ids(gruposDeLaPortada(lista, "lima"));
    expect(grupos).toEqual([["CMS-1", "POL-1", "CON-1"], ["CMS-2", "TOP-1", "TOP-2"]]);
    expect(new Set(grupos.flat()).size).toBe(grupos.flat().length);
  });

  it("con menos de tres prendas no hay portada nueva", () => {
    expect(gruposDeLaPortada([prenda("POL-1", 1), prenda("PAN-1", 2)], null)).toEqual([]);
    expect(gruposDeLaPortada([], null)).toEqual([]);
  });

  it("con una sola categoría, llena los tres paneles con ella", () => {
    expect(ids(gruposDeLaPortada([prenda("POL-1", 1), prenda("POL-2", 2), prenda("POL-3", 3)], null))).toEqual([["POL-1", "POL-2", "POL-3"]]);
  });

  it("nunca hay más de tres grupos", () => {
    const lista = ["POL", "PAN", "TOP"].flatMap((c, i) => [1, 2, 3, 4, 5].map((n) => prenda(`${c}-${n}`, n * 3 + i)));
    expect(gruposDeLaPortada(lista, null)).toHaveLength(3);
  });

  it("muestra lo que paga el cliente", () => {
    const [g] = gruposDeLaPortada([prenda("POL-1", 1, { precioFinal: 40 }), prenda("PAN-1", 2), prenda("TOP-1", 3)], null);
    expect(g.prendas[0].precio).toContain("40");
  });
});

describe("debajo de la portada", () => {
  it("cada categoría muestra su prenda más vendida con foto", () => {
    const lista = [prenda("TOP-1", 3), prenda("TOP-2", 4, { vendidos: 3 }), prenda("TOP-3", 5, { fotos: [], vendidos: 1 })];
    const [c, ...resto] = categoriasConFoto(lista);
    expect(resto).toEqual([]);
    expect(c.foto).toContain("TOP-2");
    expect(c.nombre).toBe("TOP");
  });

  it("una categoría sin ninguna foto no sale", () => {
    expect(categoriasConFoto([prenda("TOP-1", 3, { fotos: [] })])).toEqual([]);
  });

  it("sin puesto en ventas, la que llegó hace menos", () => {
    expect(categoriasConFoto([prenda("TOP-1", 20), prenda("TOP-2", 2)])[0].foto).toContain("TOP-2");
  });

});
