import { describe, expect, it } from "vitest";
import { ejesDelModelo, fraseDeLaTallaNueva, prendasQueNacen, puedeAgregarTalla, tallasQueFaltan } from "./agregar-variantes-orden-reglas";
import type { CategoriaDeModelo } from "./modelo-nuevo-reglas";

// «+ Talla» en Nueva orden: qué se ofrece y qué se dice. La base (`agregar_variantes_a_modelo`) decide de verdad; esto solo no ofrece lo que ella rechazaría.

const categoria: CategoriaDeModelo = {
  id: "c1",
  nombre: "Blusas",
  prefijo: "BLU",
  familia: "superior",
  tallas: [
    { id: "xl", valor: "XL", habitual: false },
    { id: "m", valor: "M", habitual: true },
    { id: "s", valor: "S", habitual: true },
    { id: "l", valor: "L", habitual: true },
  ],
};
const v = (talla: string | null, color: string | null) => ({ talla, color });
const gris = [v("S", "Gris perla"), v("M", "Gris perla"), v("S", "Nude"), v("M", "Nude")];

describe("tallasQueFaltan", () => {
  it("ofrece las de la categoría que el modelo no vende, en el orden S · M · L · XL", () => {
    expect(tallasQueFaltan(categoria, gris).map((t) => t.valor)).toEqual(["L", "XL"]);
  });
  it("«Única» y «Estándar» no se ofrecen: no son una talla más sino una prenda de una sola medida", () => {
    const conUnica = { ...categoria, tallas: [...categoria.tallas, { id: "u", valor: "Única", habitual: false }, { id: "e", valor: "Estándar", habitual: false }] };
    expect(tallasQueFaltan(conUnica, gris).map((t) => t.valor)).toEqual(["L", "XL"]);
  });
  it("sin categoría o con todas las tallas no ofrece nada", () => {
    expect(tallasQueFaltan(null, gris)).toEqual([]);
    expect(tallasQueFaltan(categoria, ["S", "M", "L", "XL"].map((t) => v(t, "Nude")))).toEqual([]);
  });
  it("una talla que el modelo vende solo en un color ya cuenta como tenida", () => {
    expect(tallasQueFaltan(categoria, [v("S", "Nude"), v("L", "Gris perla")]).map((t) => t.valor)).toEqual(["M", "XL"]);
  });
});

describe("puedeAgregarTalla", () => {
  const base = { puedeEditarCatalogo: true, categoria, variantes: gris };
  it("lo ofrece cuando todo está en orden", () => {
    expect(puedeAgregarTalla(base)).toEqual({ puede: true });
  });
  it("quien no edita el catálogo ve el botón apagado y por qué", () => {
    expect(puedeAgregarTalla({ ...base, puedeEditarCatalogo: false })).toMatchObject({ puede: false, motivo: expect.stringContaining("edita el catálogo") });
  });
  it("talla única, sin variantes, sin categoría o sin tallas por agregar: apagado con su motivo", () => {
    expect(puedeAgregarTalla({ ...base, variantes: [v(null, "Nude")] })).toMatchObject({ puede: false, motivo: expect.stringContaining("talla única") });
    expect(puedeAgregarTalla({ ...base, variantes: [] })).toMatchObject({ puede: false });
    expect(puedeAgregarTalla({ ...base, categoria: null })).toMatchObject({ puede: false, motivo: expect.stringContaining("categoría") });
    expect(puedeAgregarTalla({ ...base, variantes: ["S", "M", "L", "XL"].map((t) => v(t, "Nude")) })).toMatchObject({ puede: false, motivo: expect.stringContaining("todas las tallas") });
  });
});

describe("lo que se crea", () => {
  it("nace una prenda por color; un modelo sin color, una sola", () => {
    expect(prendasQueNacen(gris)).toBe(2);
    expect(prendasQueNacen([v("S", null), v("M", null)])).toBe(1);
  });
  it("la frase nombra la talla, los colores y lo que NO se toca (precio, costo, stock)", () => {
    expect(fraseDeLaTallaNueva("L", [...gris, v("S", "Gris piedra")])).toBe(
      "Se crea la talla L en Gris perla, Nude y Gris piedra: 3 prendas nuevas, con el precio y el costo del modelo y sin stock."
    );
    expect(fraseDeLaTallaNueva("L", [v("S", "Nude")])).toBe("Se crea la talla L en Nude: 1 prenda nueva, con el precio y el costo del modelo y sin stock.");
    expect(fraseDeLaTallaNueva("L", [v("S", null)])).toBe("Se crea la talla L: 1 prenda nueva, con el precio y el costo del modelo y sin stock.");
  });
});

describe("ejesDelModelo", () => {
  it("lee tallas en orden, colores únicos y si falta alguno de los dos ejes", () => {
    expect(ejesDelModelo([v("M", "Nude"), v("S", "Nude"), v("S", "Gris")])).toEqual({ tallas: ["S", "M"], colores: ["Nude", "Gris"], sinTalla: false, sinColor: false });
    expect(ejesDelModelo([v(null, "Nude")])).toMatchObject({ sinTalla: true, sinColor: false });
    expect(ejesDelModelo([v("S", null)])).toMatchObject({ sinTalla: false, sinColor: true });
  });
});
