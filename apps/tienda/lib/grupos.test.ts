import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { delGrupo, grupoDe, gruposDe, GRUPOS, leerGrupo, MENUS, tituloPartido } from "./grupos";

const prenda = (nombre: string, prefijo: string | null, extra: Partial<Prenda> = {}): Prenda => ({
  id: nombre,
  codigo: null,
  nombre,
  categoria: prefijo === null ? null : { nombre: `Cat ${prefijo}`, prefijo },
  precio: 50,
  precioFinal: 50,
  desde: false,
  campana: null,
  colores: [],
  fotos: [],
  stock: null,
  nuevo: null,
  vendidos: null,
  ...extra,
});

describe("los grupos de categorías", () => {
  it("cada prefijo está en UN solo grupo, y cada grupo en un menú que existe", () => {
    const vistos = new Map<string, string>();
    for (const g of GRUPOS) {
      expect(MENUS.map((m) => m.clave)).toContain(g.menu);
      for (const p of g.prefijos) {
        expect(vistos.get(p), `${p} está en ${vistos.get(p)} y en ${g.clave}`).toBeUndefined();
        vistos.set(p, g.clave);
      }
    }
    expect(new Set(GRUPOS.map((g) => g.clave)).size).toBe(GRUPOS.length);
  });

  it("la ropa va en «Ropa» y lo demás en «Accesorios»; lo que nadie ordenó cae en «Encima y más»", () => {
    expect(grupoDe("CMS").clave).toBe("arriba");
    expect(grupoDe("COR").clave).toBe("arriba");
    expect(grupoDe("VES").clave).toBe("vestidos");
    expect(grupoDe("JEA").clave).toBe("abajo");
    expect(grupoDe("BLZ").clave).toBe("encima");
    expect(grupoDe("CAR")).toMatchObject({ clave: "accesorios", menu: "accesorios" });
    expect(grupoDe("ARE")).toMatchObject({ clave: "bisuteria", menu: "accesorios" });
    expect(grupoDe("MAQ").clave).toBe("bisuteria");
    expect(grupoDe("ZAP").clave).toBe("calzado");
    // Una categoría nueva (o sin prefijo: su clave es el nombre) se ve, en «Encima y más».
    expect(grupoDe("KIM")).toMatchObject({ clave: "encima", menu: "ropa" });
    expect(grupoDe("Kimonos").clave).toBe("encima");
  });

  it("gruposDe: solo los grupos con algo, en su orden; sus categorías en el orden de su lista y lo desconocido al final, por cuántas hay", () => {
    const prendas = [
      prenda("Top", "TOP"),
      prenda("Blusa 1", "CMS"),
      prenda("Blusa 2", "CMS"),
      prenda("Kimono", "KIM"),
      prenda("Capa", "CAP"),
      prenda("Casaca", "CAS"),
      prenda("Poncho 1", "PON"),
      prenda("Poncho 2", "PON"),
      prenda("Aretes", "ARE"),
      prenda("Sin categoría", null),
    ];
    const g = gruposDe(prendas);
    expect(g.map((x) => [x.clave, x.cuantas, x.categorias.map((c) => [c.clave, c.cuantas])])).toEqual([
      ["arriba", 3, [["CMS", 2], ["TOP", 1]]],
      ["encima", 5, [["CAS", 1], ["CAP", 1], ["PON", 2], ["KIM", 1]]],
      ["bisuteria", 1, [["ARE", 1]]],
    ]);
    expect(g[0].categorias[0].prendas.map((p) => p.nombre)).toEqual(["Blusa 1", "Blusa 2"]);
    expect(gruposDe([])).toEqual([]);
  });

  it("delGrupo: solo las del grupo (sin grupo, todas); leerGrupo: solo un grupo que existe", () => {
    const prendas = [prenda("Top", "TOP"), prenda("Aretes", "ARE"), prenda("Sin categoría", null)];
    expect(delGrupo(prendas, leerGrupo("arriba")).map((p) => p.nombre)).toEqual(["Top"]);
    expect(delGrupo(prendas, null)).toHaveLength(3);
    expect(leerGrupo("bisuteria")?.nombre).toBe("Bisutería y belleza");
    expect(leerGrupo(["abajo", "arriba"])?.clave).toBe("abajo");
    for (const raro of [undefined, "", "  ", "Arriba", "otra"]) expect(leerGrupo(raro), String(raro)).toBeNull();
  });

  it("el título partido: lo último en cursiva", () => {
    expect(tituloPartido("Vestidos")).toEqual(["", "Vestidos"]);
    expect(tituloPartido("Vestidos y conjuntos")).toEqual(["Vestidos y", "conjuntos"]);
    expect(tituloPartido(" Camisas y Blusas ")).toEqual(["Camisas y", "Blusas"]);
  });
});
