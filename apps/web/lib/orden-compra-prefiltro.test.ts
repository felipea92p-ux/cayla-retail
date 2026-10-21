import { describe, expect, it } from "vitest";
import { afinidadDe, prefiltrar, textoDeAfinidad } from "./orden-compra-prefiltro";

const op = (...ids: string[]) => ids.map((valor) => ({ valor, texto: valor.toUpperCase() }));
const sinElegidas = new Set<string>();
const vinculos = [
  { marcaId: "m1", proveedorId: "p1" },
  { marcaId: "m2", proveedorId: "p1" },
  { marcaId: "m3", proveedorId: "p2" },
];

describe("afinidadDe: lo que maneja el proveedor elegido", () => {
  it("las categorías de su historial y las marcas que tiene vinculadas", () => {
    const a = afinidadDe("p1", { p1: ["c1", "c2"], p2: ["c3"] }, vinculos)!;
    expect([...a.categorias].sort()).toEqual(["c1", "c2"]);
    expect([...a.marcas].sort()).toEqual(["m1", "m2"]);
  });
  it("sin proveedor elegido no hay afinidad", () => {
    expect(afinidadDe("", { p1: ["c1"] }, vinculos)).toBeNull();
  });
  it("si no se pudieron leer las categorías (null o sin la migración) NO se filtra nada, ni las marcas", () => {
    expect(afinidadDe("p1", null, vinculos)).toBeNull();
    expect(afinidadDe("p1", undefined, vinculos)).toBeNull();
  });
  it("un proveedor que no aparece en el historial tiene el conjunto vacío (no es lo mismo que «no se pudo leer»)", () => {
    const a = afinidadDe("p9", { p1: ["c1"] }, vinculos)!;
    expect(a.categorias.size).toBe(0);
    expect(a.marcas.size).toBe(0);
  });
});

describe("prefiltrar: solo lo suyo, con «Ver todas»", () => {
  const todas = op("c1", "c2", "c3", "c4");

  it("deja solo las que el proveedor maneja y dice que hay más escondidas", () => {
    const r = prefiltrar(todas, new Set(["c1", "c3"]), { verTodas: false, conservar: sinElegidas });
    expect(r.opciones.map((o) => o.valor)).toEqual(["c1", "c3"]);
    expect(r.total).toBe(4);
    expect(r.filtrada).toBe(true);
  });
  it("conserva el orden de la lista original", () => {
    const r = prefiltrar(todas, new Set(["c3", "c1"]), { verTodas: false, conservar: sinElegidas });
    expect(r.opciones.map((o) => o.valor)).toEqual(["c1", "c3"]);
  });
  it("«Ver todas» lo muestra todo y ya no ofrece «Ver todas»", () => {
    const r = prefiltrar(todas, new Set(["c1"]), { verTodas: true, conservar: sinElegidas });
    expect(r.opciones).toHaveLength(4);
    expect(r.filtrada).toBe(false);
  });
  it("un proveedor sin nada derivado ve TODO y sin «Ver todas» (no hay nada que esconder: no se sabe)", () => {
    for (const propias of [new Set<string>(), null]) {
      const r = prefiltrar(todas, propias, { verTodas: false, conservar: sinElegidas });
      expect(r.opciones).toHaveLength(4);
      expect(r.filtrada).toBe(false);
    }
  });
  it("lo ya elegido en una línea no desaparece aunque el proveedor no lo maneje (el combo se vería vacío)", () => {
    const r = prefiltrar(todas, new Set(["c1"]), { verTodas: false, conservar: new Set(["c4"]) });
    expect(r.opciones.map((o) => o.valor)).toEqual(["c1", "c4"]);
    expect(r.filtrada).toBe(true);
  });
  it("si maneja todas no hay «Ver todas»", () => {
    const r = prefiltrar(todas, new Set(["c1", "c2", "c3", "c4"]), { verTodas: false, conservar: sinElegidas });
    expect(r.filtrada).toBe(false);
  });
  it("un conjunto que no calza con ninguna opción deja la lista vacía pero con «Ver todas» (el caso de una categoría archivada)", () => {
    const r = prefiltrar(todas, new Set(["zz"]), { verTodas: false, conservar: sinElegidas });
    expect(r.opciones).toEqual([]);
    expect(r.filtrada).toBe(true);
  });
  it("es estable: la misma entrada da lo mismo, y no modifica la lista que recibe", () => {
    const copia = [...todas];
    const a = prefiltrar(todas, new Set(["c2"]), { verTodas: false, conservar: sinElegidas });
    const b = prefiltrar(todas, new Set(["c2"]), { verTodas: false, conservar: sinElegidas });
    expect(a).toEqual(b);
    expect(todas).toEqual(copia);
  });
});

describe("textoDeAfinidad: por qué se ve todo, solo cuando es por no saber", () => {
  const con = (categorias: string[], marcas: string[]) => ({ categorias: new Set(categorias), marcas: new Set(marcas) });
  it("sin proveedor o sin lectura, nada que decir", () => {
    expect(textoDeAfinidad(null)).toBeNull();
  });
  it("proveedor nuevo: primera vez", () => {
    expect(textoDeAfinidad(con([], []))).toBe("Es la primera vez con este proveedor: ves todas las categorías y marcas.");
  });
  it("con marcas pero sin categorías derivadas", () => {
    expect(textoDeAfinidad(con([], ["m1"]))).toBe("Todavía no sabemos qué categorías maneja este proveedor: ves todas.");
  });
  it("con categorías pero sin marcas", () => {
    expect(textoDeAfinidad(con(["c1"], []))).toBe("Este proveedor no tiene marcas registradas: ves todas.");
  });
  it("con las dos cosas no lleva texto: el pie «Ver todas (N)» del combo ya lo dice", () => {
    expect(textoDeAfinidad(con(["c1"], ["m1"]))).toBeNull();
  });
});
