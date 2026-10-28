import { describe, expect, it } from "vitest";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import { detalleDePosible, fraseDePosibles, prendasPosibles, type PrendaParaPosibles } from "./prenda-sin-registrar-posibles";

const base: PrendaParaPosibles = {
  varianteId: "v-blusa-m-neg",
  referencia: "Blusa Emma",
  talla: "M",
  color: "Negro",
  colorHex: "#111111",
  colorCodigo: "NEG",
  categoriaId: "cat-blusas",
  tallaId: "t-m",
  fotoUrl: null,
  precio: 79.9,
  categoria: "Blusas",
  categoriaPrefijo: "BLU",
  categoriaFamilia: "tops",
  stockAqui: 2,
};
const elegido = { categoriaId: "cat-blusas", tallaId: "t-m", colorCodigo: "NEG" };
const cobrable = (v: PrendaParaPosibles) => v.stockAqui > 0;

describe("prendasPosibles — las prendas del catálogo que coinciden con lo que caja eligió", () => {
  it("la misma categoría, talla y color, con stock en el piso: es posible", () => {
    const r = prendasPosibles([base], elegido, cobrable);
    expect(r.map((p) => p.varianteId)).toEqual(["v-blusa-m-neg"]);
    expect(r[0]).toMatchObject({ referencia: "Blusa Emma", precio: 79.9, stockAqui: 2, categoriaPrefijo: "BLU" });
  });

  it("sin los tres datos elegidos no ofrece nada", () => {
    expect(prendasPosibles([base], { categoriaId: "cat-blusas", tallaId: "t-m" }, cobrable)).toEqual([]);
    expect(prendasPosibles([base], { categoriaId: "cat-blusas", colorCodigo: "NEG" }, cobrable)).toEqual([]);
    expect(prendasPosibles([base], {}, cobrable)).toEqual([]);
  });

  it.each([
    ["otra categoría", { categoriaId: "cat-vestidos" }],
    ["otra talla", { tallaId: "t-s" }],
    ["otro color", { colorCodigo: "BLA" }],
  ])("con %s no coincide", (_, cambio) => {
    expect(prendasPosibles([{ ...base, ...cambio }], elegido, cobrable)).toEqual([]);
  });

  it("lo que no se puede cobrar ahora (sin piso, apartada) no se ofrece aunque coincida", () => {
    expect(prendasPosibles([{ ...base, stockAqui: 0 }], elegido, cobrable)).toEqual([]);
    expect(prendasPosibles([base], elegido, () => false)).toEqual([]);
  });

  it("la centinela «Cargo especial» nunca es posible", () => {
    expect(prendasPosibles([{ ...base, varianteId: ID_CARGO_ESPECIAL }], elegido, cobrable)).toEqual([]);
  });

  it("un catálogo guardado sin ids (antes de este cambio) no adivina por nombre", () => {
    expect(prendasPosibles([{ ...base, categoriaId: undefined, tallaId: undefined }], elegido, cobrable)).toEqual([]);
    expect(prendasPosibles([{ ...base, colorCodigo: null }], elegido, cobrable)).toEqual([]);
  });

  it("la que más unidades tiene va primero; a igual stock, por referencia", () => {
    const r = prendasPosibles(
      [
        { ...base, varianteId: "c", referencia: "Blusa Zoe", stockAqui: 1 },
        { ...base, varianteId: "a", referencia: "Blusa Ana", stockAqui: 1 },
        { ...base, varianteId: "b", referencia: "Blusa Mía", stockAqui: 4 },
      ],
      elegido,
      cobrable,
    );
    expect(r.map((p) => p.varianteId)).toEqual(["b", "a", "c"]);
  });

  it("los textos: cuántas hay y qué queda de cada una", () => {
    expect(fraseDePosibles(1)).toBe("Hay 1 prenda así en el piso de tu tienda. ¿Es esta?");
    expect(fraseDePosibles(3)).toBe("Hay 3 prendas así en el piso de tu tienda. ¿Es alguna de estas?");
    expect(detalleDePosible({ talla: "M", color: "Negro", stockAqui: 1 })).toBe("M · Negro · 1 en el piso");
    expect(detalleDePosible({ talla: null, color: "Negro", stockAqui: 3 })).toBe("Negro · 3 en el piso");
  });
});
