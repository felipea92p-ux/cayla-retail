import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import { delGrupo, delMenu, grupoDe, gruposDe, GRUPOS, leerGrupo, leerMenu, MENUS, tituloPartido } from "./grupos";

const prenda = (nombre: string, prefijo: string | null, extra: Partial<Prenda> = {}): Prenda => ({
  empresa: null,
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

  it("la ropa va en «Ropa» y lo demás en «Accesorios»; lo que nadie ordenó cae en «Chompas/Abrigos»", () => {
    expect(grupoDe("CMS").clave).toBe("arriba");
    expect(grupoDe("COR").clave).toBe("arriba");
    expect(grupoDe("VES").clave).toBe("vestidos");
    expect(grupoDe("JEA").clave).toBe("abajo");
    expect(grupoDe("BLZ").clave).toBe("encima");
    // Chompas y poleras abrigan: van con las casacas, no con las blusas (Felipe, 2026-10-21).
    expect(grupoDe("CMP").clave).toBe("encima");
    expect(grupoDe("SUD").clave).toBe("encima");
    expect(grupoDe("LEN").clave).toBe("vestidos");
    expect(grupoDe("CAR")).toMatchObject({ clave: "bolsos", menu: "accesorios" });
    expect(grupoDe("CIN").clave).toBe("bolsos");
    expect(grupoDe("LSO")).toMatchObject({ clave: "cabeza", menu: "accesorios" });
    expect(grupoDe("REL").clave).toBe("bisuteria");
    expect(grupoDe("ACC")).toMatchObject({ clave: "mas", menu: "accesorios" });
    expect(grupoDe("ARE")).toMatchObject({ clave: "bisuteria", menu: "accesorios" });
    expect(grupoDe("MAQ").clave).toBe("bisuteria");
    expect(grupoDe("ZAP").clave).toBe("calzado");
    // Una categoría nueva sin familia (una base que todavía no la manda; o sin prefijo: su clave es el nombre) se ve, en «Más ropa».
    expect(grupoDe("KIM")).toMatchObject({ clave: "otras", menu: "ropa" });
    expect(grupoDe("Kimonos").clave).toBe("otras");
  });

  it("una categoría nueva cae en la sección de su familia, no en un cajón cualquiera; la tabla por prefijo manda sobre la familia", () => {
    expect(grupoDe("KIM", "indumentaria")).toMatchObject({ clave: "otras", menu: "ropa" });
    expect(grupoDe("TAC", "calzado")).toMatchObject({ clave: "calzado", menu: "accesorios" });
    expect(grupoDe("DIA", "bisuteria").clave).toBe("bisuteria");
    expect(grupoDe("BRO", "belleza").clave).toBe("bisuteria");
    expect(grupoDe("GUA", "accesorios")).toMatchObject({ clave: "mas", menu: "accesorios" });
    expect(grupoDe("SEL", "papeleria").clave).toBe("mas");
    // Una familia que nadie conoce no rompe: va a «Más ropa», como sin familia.
    expect(grupoDe("XXX", "familia_inventada").clave).toBe("otras");
    // Lo que la tabla conoce no cambia por su familia (aunque venga distinta).
    expect(grupoDe("CMP", "accesorios").clave).toBe("encima");
    expect(grupoDe("CAR", null).clave).toBe("bolsos");
  });

  it("toda familia que la base permite tiene su grupo de respaldo, y todo grupo de respaldo existe", () => {
    for (const familia of ["indumentaria", "calzado", "accesorios", "bisuteria", "belleza", "papeleria", "empaque"]) {
      expect(GRUPOS.map((g) => g.clave)).toContain(grupoDe("NUEVA", familia).clave);
    }
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
      ["encima", 2, [["CAS", 1], ["CAP", 1]]],
      ["otras", 3, [["PON", 2], ["KIM", 1]]],
      ["bisuteria", 1, [["ARE", 1]]],
    ]);
    expect(g[0].categorias[0].prendas.map((p) => p.nombre)).toEqual(["Blusa 1", "Blusa 2"]);
    expect(gruposDe([])).toEqual([]);
  });

  it("una categoría nueva de calzado o de bisutería se ve en su menú y su grupo, sin que nadie toque la tabla", () => {
    const conFamilia = (nombre: string, prefijo: string, familia: string) =>
      prenda(nombre, prefijo, { categoria: { nombre: `Cat ${prefijo}`, prefijo, familia } });
    const prendas = [conFamilia("Tacones", "TAC", "calzado"), conFamilia("Diadema", "DIA", "bisuteria"), conFamilia("Kimono", "KIM", "indumentaria"), prenda("Blusa", "CMS")];
    expect(gruposDe(prendas).map((g) => [g.clave, g.categorias.map((c) => c.clave)])).toEqual([
      ["arriba", ["CMS"]],
      ["otras", ["KIM"]],
      ["bisuteria", ["DIA"]],
      ["calzado", ["TAC"]],
    ]);
    expect(delMenu(prendas, "accesorios").map((p) => p.nombre)).toEqual(["Tacones", "Diadema"]);
    expect(delMenu(prendas, "ropa").map((p) => p.nombre)).toEqual(["Kimono", "Blusa"]);
    expect(delGrupo(prendas, leerGrupo("calzado")).map((p) => p.nombre)).toEqual(["Tacones"]);
  });

  it("delGrupo: solo las del grupo (sin grupo, todas); leerGrupo: solo un grupo que existe", () => {
    const prendas = [prenda("Top", "TOP"), prenda("Aretes", "ARE"), prenda("Sin categoría", null)];
    expect(delGrupo(prendas, leerGrupo("arriba")).map((p) => p.nombre)).toEqual(["Top"]);
    expect(delGrupo(prendas, null)).toHaveLength(3);
    expect(leerGrupo("bisuteria")?.nombre).toBe("Bisutería/Belleza");
    expect(leerGrupo(["abajo", "arriba"])?.clave).toBe("abajo");
    for (const raro of [undefined, "", "  ", "Arriba", "otra"]) expect(leerGrupo(raro), String(raro)).toBeNull();
  });

  it("delMenu: toda la ropa (o todos los accesorios) junta; sin menú, todas; lo desconocido cae en «Ropa»; leerMenu: solo un menú que existe", () => {
    const prendas = [prenda("Top", "TOP"), prenda("Vestido", "VES"), prenda("Aretes", "ARE"), prenda("Zapatilla", "ZAP"), prenda("Kimono", "KIM"), prenda("Sin categoría", null)];
    expect(delMenu(prendas, "ropa").map((p) => p.nombre)).toEqual(["Top", "Vestido", "Kimono"]);
    expect(delMenu(prendas, "accesorios").map((p) => p.nombre)).toEqual(["Aretes", "Zapatilla"]);
    expect(delMenu(prendas, null)).toHaveLength(6);
    expect(leerMenu("ropa")?.todo).toBe("Toda la ropa");
    expect(leerMenu(["accesorios", "ropa"])?.titulo).toEqual(["Todos los", "accesorios"]);
    for (const raro of [undefined, "", "  ", "Ropa", "otro"]) expect(leerMenu(raro), String(raro)).toBeNull();
  });

  it("el título partido: lo último en cursiva", () => {
    expect(tituloPartido("Vestidos")).toEqual(["", "Vestidos"]);
    expect(tituloPartido("Vestidos y conjuntos")).toEqual(["Vestidos y", "conjuntos"]);
    expect(tituloPartido(" Camisas y Blusas ")).toEqual(["Camisas y", "Blusas"]);
  });
});
