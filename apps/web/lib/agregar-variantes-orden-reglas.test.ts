import { describe, expect, it } from "vitest";
import type { ColorAlta } from "./alta-producto";
import { coloresDesactivados, coloresQueFaltan, ejesDelModelo, fraseDeLasTallasNuevas, fraseDeLosColoresNuevos, puedeAgregarColor, puedeAgregarTalla, tallasDesactivadas, tallasQueFaltan } from "./agregar-variantes-orden-reglas";
import type { CategoriaDeModelo } from "./modelo-nuevo-reglas";

// «+ Talla» y «+ Color» en Nueva orden: qué se ofrece y qué se dice. La base (`agregar_variantes_a_modelo`) decide de verdad; esto solo no ofrece lo que ella rechazaría.

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
const v = (talla: string | null, color: string | null, colorCodigo: string | null = color ? color.slice(0, 3).toUpperCase() : null) => ({ talla, color, colorCodigo });
const gris = [v("S", "Gris perla"), v("M", "Gris perla"), v("S", "Nude"), v("M", "Nude")];
const color = (codigo: string, nombre: string): ColorAlta => ({ codigo, nombre, hex: null, familiaColor: "neutros" });

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

describe("coloresQueFaltan", () => {
  const todos = [color("GRI", "Gris perla"), color("NUD", "Nude"), color("VER", "Verde"), color("AZU", "Azul")];
  it("quita los que el modelo ya vende (por código, no por nombre) y conserva el orden del vocabulario", () => {
    expect(coloresQueFaltan(todos, gris).map((c) => c.codigo)).toEqual(["VER", "AZU"]);
  });
  it("un color renombrado en el vocabulario sigue contando como tenido", () => {
    expect(coloresQueFaltan([color("NUD", "Piel"), color("VER", "Verde")], gris).map((c) => c.codigo)).toEqual(["VER"]);
  });
  it("un modelo sin color no tiene ninguno: se ofrece todo (aunque puedeAgregarColor lo apague)", () => {
    expect(coloresQueFaltan(todos, [v("S", null)])).toHaveLength(4);
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

describe("puedeAgregarColor", () => {
  const base = { puedeEditarCatalogo: true, hayColores: true, variantes: gris };
  it("lo ofrece cuando todo está en orden", () => {
    expect(puedeAgregarColor(base)).toEqual({ puede: true });
  });
  it("sin permiso, un modelo sin color, sin variantes o sin la lista de colores: apagado con su motivo", () => {
    expect(puedeAgregarColor({ ...base, puedeEditarCatalogo: false })).toMatchObject({ puede: false, motivo: expect.stringContaining("edita el catálogo") });
    expect(puedeAgregarColor({ ...base, variantes: [v("S", null)] })).toMatchObject({ puede: false, motivo: expect.stringContaining("no tiene color") });
    expect(puedeAgregarColor({ ...base, variantes: [] })).toMatchObject({ puede: false });
    expect(puedeAgregarColor({ ...base, hayColores: false })).toMatchObject({ puede: false, motivo: expect.stringContaining("colores") });
  });
  it("un modelo en talla única SÍ recibe colores: nace una prenda por color", () => {
    expect(puedeAgregarColor({ ...base, variantes: [v(null, "Nude")] })).toEqual({ puede: true });
  });
});

describe("lo que se crea", () => {
  it("tallas: nace una prenda por cada talla nueva y color del modelo; sin color, una por talla", () => {
    expect(fraseDeLasTallasNuevas(["L"], [...gris, v("S", "Gris piedra")])).toBe(
      "Se crea la talla L en Gris perla, Nude y Gris piedra: 3 prendas nuevas, con el precio y el costo del modelo y sin stock."
    );
    expect(fraseDeLasTallasNuevas(["L", "XL"], gris)).toBe("Se crean las tallas L y XL en Gris perla y Nude: 4 prendas nuevas, con el precio y el costo del modelo y sin stock.");
    expect(fraseDeLasTallasNuevas(["L"], [v("S", null)])).toBe("Se crea la talla L: 1 prenda nueva, con el precio y el costo del modelo y sin stock.");
  });
  it("colores: nace una prenda por cada color nuevo y talla del modelo; sin talla, una por color", () => {
    expect(fraseDeLosColoresNuevos(["Verde"], gris)).toBe("Se crea el color Verde en S y M: 2 prendas nuevas, con el precio y el costo del modelo y sin stock.");
    expect(fraseDeLosColoresNuevos(["Verde", "Azul", "Rojo"], [...gris, v("L", "Nude")])).toBe(
      "Se crean los colores Verde, Azul y Rojo en S, M y L: 9 prendas nuevas, con el precio y el costo del modelo y sin stock."
    );
    expect(fraseDeLosColoresNuevos(["Verde"], [v(null, "Nude")])).toBe("Se crea el color Verde: 1 prenda nueva, con el precio y el costo del modelo y sin stock.");
  });
});

describe("ejesDelModelo", () => {
  it("lee tallas en orden, colores únicos y si falta alguno de los dos ejes", () => {
    expect(ejesDelModelo([v("M", "Nude"), v("S", "Nude"), v("S", "Gris")])).toEqual({ tallas: ["S", "M"], colores: ["Nude", "Gris"], sinTalla: false, sinColor: false });
    expect(ejesDelModelo([v(null, "Nude")])).toMatchObject({ sinTalla: true, sinColor: false });
    expect(ejesDelModelo([v("S", null)])).toMatchObject({ sinTalla: false, sinColor: true });
  });
});

// /chaos 2026-10-31, hallazgo #1: la hoja ofrecía una talla o un color cuyas variantes están DESACTIVADAS en el modelo y la base lo rechazaba («ya existe pero está desactivada»). Reactivar es de
// Editar producto, así que no se ofrece, y se dice por qué.
describe("variantes desactivadas del modelo (hallazgo #1 del /chaos)", () => {
  const apagadas = [v("L", "Gris perla"), v("L", "Nude")];
  it("una talla cuyas variantes están desactivadas no se ofrece; las demás sí", () => {
    expect(tallasQueFaltan(categoria, gris, apagadas).map((t) => t.valor)).toEqual(["XL"]);
    expect(tallasDesactivadas(categoria, gris, apagadas)).toEqual(["L"]);
  });
  it("basta UNA variante desactivada en un color que el modelo vende para frenar la talla (la base crearía esa combinación y chocaría)", () => {
    expect(tallasQueFaltan(categoria, gris, [v("L", "Nude")]).map((t) => t.valor)).toEqual(["XL"]);
  });
  it("una desactivada en un color que el modelo ya no vende no estorba: la base solo cruza con los colores de sus variantes activas", () => {
    expect(tallasQueFaltan(categoria, gris, [v("L", "Verde")]).map((t) => t.valor)).toEqual(["L", "XL"]);
    expect(tallasDesactivadas(categoria, gris, [v("L", "Verde")])).toEqual([]);
  });
  it("un color con una variante desactivada en una talla que el modelo vende no se ofrece", () => {
    const todos = [color("GRI", "Gris perla"), color("NUD", "Nude"), color("VER", "Verde"), color("AZU", "Azul")];
    expect(coloresQueFaltan(todos, gris, [v("S", "Verde")]).map((c) => c.codigo)).toEqual(["AZU"]);
    expect(coloresDesactivados(todos, gris, [v("S", "Verde")]).map((c) => c.nombre)).toEqual(["Verde"]);
    expect(coloresQueFaltan(todos, gris, [v("XL", "Verde")]).map((c) => c.codigo)).toEqual(["VER", "AZU"]);
  });
  it("sin desactivadas todo sigue igual", () => {
    expect(tallasQueFaltan(categoria, gris, []).map((t) => t.valor)).toEqual(["L", "XL"]);
    expect(tallasQueFaltan(categoria, gris).map((t) => t.valor)).toEqual(["L", "XL"]);
  });
  it("si lo único que falta está desactivado, «+ Talla» se apaga y dice que se reactiva desde Editar producto", () => {
    const todasMenosXL = ["S", "M", "L"].map((t) => v(t, "Nude"));
    expect(puedeAgregarTalla({ puedeEditarCatalogo: true, categoria, variantes: todasMenosXL, desactivadas: [v("XL", "Nude")] })).toMatchObject({
      puede: false,
      motivo: expect.stringContaining("Editar producto"),
    });
  });
});
