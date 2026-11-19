import { describe, expect, it } from "vitest";
import { codigoDelNombre, prendaDeCodigo, resumirNombres, sugerirModelos, type ModeloDeOferta } from "./oferta-prendas-buscar";

const m = (id: string, nombre: string, categoriaId: string | null = "cat-blusas"): ModeloDeOferta => ({ id, nombre, categoriaId, precio: 100, deClaure: false });
const categoria = (id: string) => ({ "cat-blusas": "Camisas y Blusas", "cat-pantalones": "Pantalones" })[id] ?? "";

describe("la prenda leída con la pistola o la cámara (hoja de una oferta, fase «¿En qué prendas?»)", () => {
  const prendas = [
    { id: "v-falda-m", nombre: "Falda Emma (FAL-0008-NEG-M)", productoId: "p-falda" },
    { id: "v-falda-s", nombre: "Falda Emma (FAL-0008-NEG-S)", productoId: "p-falda" },
    { id: "v-blusa-s", nombre: "Blusa Aurora (BLU-0001-BLA-S)", productoId: "p-blusa" },
    { id: "v-bolsa", nombre: "Bolsa sin modelo (BOL-1)" },
  ];

  it("saca el código del final del nombre", () => {
    expect(codigoDelNombre("Falda Emma (FAL-0008-NEG-M)")).toBe("FAL-0008-NEG-M");
    expect(codigoDelNombre("Conjunto (2 piezas) Lima (CON-0002-AZU-L)")).toBe("CON-0002-AZU-L");
    expect(codigoDelNombre("Falda Emma")).toBeNull();
  });

  it("reconoce el código exacto, sin importar mayúsculas ni espacios, y da su modelo y la talla de esa etiqueta", () => {
    expect(prendaDeCodigo(prendas, "FAL-0008-NEG-M")?.productoId).toBe("p-falda");
    expect(prendaDeCodigo(prendas, "  fal-0008-neg-s ")).toEqual({ productoId: "p-falda", varianteId: "v-falda-s" });
    expect(prendaDeCodigo(prendas, "BLU-0001-BLA-S")).toEqual({ productoId: "p-blusa", varianteId: "v-blusa-s" });
  });

  it("no adivina: un pedazo del código, un código de otra cosa o una prenda sin modelo no dan nada", () => {
    expect(prendaDeCodigo(prendas, "FAL-0008")).toBeNull();
    expect(prendaDeCodigo(prendas, "7750001234567")).toBeNull();
    expect(prendaDeCodigo(prendas, "BOL-1")).toBeNull();
    expect(prendaDeCodigo(prendas, "")).toBeNull();
  });
});

describe("las prendas sugeridas por lo escrito", () => {
  const modelos = [
    m("1", "Conjunto Chaleco y Pantalón", "cat-otros"),
    m("2", "Pantalón Carla", "cat-pantalones"),
    m("3", "Blusa Aurora"),
    m("4", "Pantalón Ana", "cat-pantalones"),
    m("5", "Camisa Lima"),
  ];

  it("primero las que empiezan con lo escrito, por nombre; después las que lo contienen", () => {
    expect(sugerirModelos(modelos, "pantalon", categoria).map((x) => x.nombre)).toEqual(["Pantalón Ana", "Pantalón Carla", "Conjunto Chaleco y Pantalón"]);
  });

  it("sin tildes ni mayúsculas, y también por el nombre de su categoría", () => {
    expect(sugerirModelos(modelos, "BLUSA", categoria).map((x) => x.id)).toEqual(["3", "5"]);
    expect(sugerirModelos(modelos, "aurora", categoria).map((x) => x.id)).toEqual(["3"]);
  });

  it("una letra sola no sugiere, lo que no existe tampoco, y nunca pasa del tope", () => {
    expect(sugerirModelos(modelos, "p", categoria)).toEqual([]);
    expect(sugerirModelos(modelos, "vestido", categoria)).toEqual([]);
    expect(sugerirModelos(modelos, "a", categoria, 2)).toEqual([]);
    expect(sugerirModelos(modelos, "an", categoria, 2)).toHaveLength(2);
  });
});

describe("muchos nombres en una línea que no crece", () => {
  it("uno, dos o tres se dicen enteros", () => {
    expect(resumirNombres([])).toBe("");
    expect(resumirNombres(["Casacas"])).toBe("Casacas");
    expect(resumirNombres(["Casacas", "Faldas"])).toBe("Casacas y Faldas");
    expect(resumirNombres(["Casacas", "Faldas", "Vestidos"])).toBe("Casacas, Faldas y Vestidos");
  });

  it("con más, los primeros y cuántos faltan: 42 categorías caben en una línea", () => {
    const muchas = Array.from({ length: 42 }, (_, i) => `Categoría ${i + 1}`);
    expect(resumirNombres(muchas)).toBe("Categoría 1, Categoría 2, Categoría 3 y 39 más");
    expect(resumirNombres(["A", "B", "C", "D"], 2)).toBe("A, B y 2 más");
  });
});
