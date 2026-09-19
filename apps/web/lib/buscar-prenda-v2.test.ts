import { describe, expect, it } from "vitest";
import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";

const prenda = (p: Partial<PrendaBuscableV2>): PrendaBuscableV2 => ({
  varianteId: "v",
  sku: "SKU",
  referencia: "Blusa Lino",
  talla: "M",
  color: "Negro",
  codigosBarras: [],
  ...p,
});

describe("buscar en la caja por marca (ADR-0109)", () => {
  const catalogo = [
    prenda({ varianteId: "a", referencia: "Polo Sport", marca: "Adidas" }),
    prenda({ varianteId: "b", referencia: "Blusa Lino", marca: "CAYLA" }),
    prenda({ varianteId: "c", referencia: "Gorro", marca: null }),
    prenda({ varianteId: "d", referencia: "Correa" }), // catálogo guardado antes de la marca: no trae el campo
  ];
  it("escribir la marca encuentra sus prendas, sin importar mayúsculas ni tildes", () => {
    expect(filtrarPrendasV2("ADIDAS", catalogo, 10).map((v) => v.varianteId)).toEqual(["a"]);
    expect(filtrarPrendasV2("cayla", catalogo, 10).map((v) => v.varianteId)).toEqual(["b"]);
  });
  it("una prenda sin marca (o de un catálogo viejo) no rompe la búsqueda ni aparece por accidente", () => {
    expect(filtrarPrendasV2("gorro", catalogo, 10).map((v) => v.varianteId)).toEqual(["c"]);
    expect(filtrarPrendasV2("null", catalogo, 10)).toEqual([]);
    expect(filtrarPrendasV2("undefined", catalogo, 10)).toEqual([]);
  });
  it("la búsqueda de antes sigue igual: por referencia, talla y color", () => {
    expect(filtrarPrendasV2("lino", catalogo, 10).map((v) => v.varianteId)).toContain("b");
    expect(filtrarPrendasV2("negro m", catalogo, 10)).toHaveLength(0); // dos palabras sueltas no se buscan por separado, como siempre
  });
  it("escanear un código sigue resolviendo por SKU o código de barras, no por marca", () => {
    const c = [prenda({ varianteId: "x", sku: "ADIDAS-1", marca: "Adidas", codigosBarras: ["750"] })];
    expect(resolverCodigoV2("750", c)?.varianteId).toBe("x");
    expect(resolverCodigoV2("adidas", c)).toBeNull();
  });
});
