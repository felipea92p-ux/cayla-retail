import { describe, expect, it } from "vitest";
import { faltaEnPrendaSinRegistrar, opcionesDeColor, pasoSiguiente, gruposDeTallas, sugerirDescripcion, tallasDeCategoria, usoDeColores } from "./prenda-sin-registrar-reglas";

const completa = { descripcion: "Blusa lino beige", categoriaId: "c", tallaId: "t", colorCodigo: "BEI", precio: 50 };

describe("faltaEnPrendaSinRegistrar", () => {
  it("completa → nada falta", () => expect(faltaEnPrendaSinRegistrar(completa)).toBeNull());
  it("descripción en blanco", () => expect(faltaEnPrendaSinRegistrar({ ...completa, descripcion: "  " })).toBe("Escribe una descripción corta"));
  it("sinDescripcion salta la descripción y dice lo siguiente", () =>
    expect(faltaEnPrendaSinRegistrar({ ...completa, descripcion: "", precio: 0 }, { sinDescripcion: true })).toBe("Escribe el precio que cobraste"));
  it("sigue el orden del formulario", () => expect(faltaEnPrendaSinRegistrar({ descripcion: "" })).toBe("Elige la categoría"));
  it("pasoSiguiente: con categoría, talla y color, sigue la descripción", () =>
    expect(pasoSiguiente({ ...completa, descripcion: " ", precio: 0 })).toBe("descripcion"));
  it("pasoSiguiente: completa → null", () => expect(pasoSiguiente(completa)).toBeNull());
  it("sin categoría", () => expect(faltaEnPrendaSinRegistrar({ ...completa, categoriaId: "" })).toBe("Elige la categoría"));
  it("sin talla", () => expect(faltaEnPrendaSinRegistrar({ ...completa, tallaId: "" })).toBe("Elige la talla"));
  it("sin color", () => expect(faltaEnPrendaSinRegistrar({ ...completa, colorCodigo: "" })).toBe("Elige el color"));
  it("precio 0", () => expect(faltaEnPrendaSinRegistrar({ ...completa, precio: 0 })).toBe("Escribe el precio que cobraste"));
  it("precio que no es número", () => expect(faltaEnPrendaSinRegistrar({ ...completa, precio: Number.NaN })).toBe("Escribe el precio que cobraste"));
});

describe("tallasDeCategoria", () => {
  const todas = [{ id: "s", valor: "S" }, { id: "m", valor: "M" }, { id: "28", valor: "28" }, { id: "xs", valor: "XS" }, { id: "u", valor: "Única" }];
  it("solo las de la categoría, en el orden de la grilla", () => {
    expect(tallasDeCategoria([{ id: "m", texto: "M" }, { id: "xs", texto: "XS" }, { id: "s", texto: "S" }], todas).map((t) => t.valor)).toEqual(["XS", "S", "M"]);
  });
  it("una categoría sin tallas configuradas ofrece solo «Única»: nunca una talla ajena (Felipe, 2026-10-01)", () => {
    expect(tallasDeCategoria(undefined, todas).map((t) => t.valor)).toEqual(["Única"]);
    expect(tallasDeCategoria([], todas).map((t) => t.valor)).toEqual(["Única"]);
  });
  it("si categoria_tallas no cargó, ofrece todas: la caja no se cae por una lista secundaria", () => {
    expect(tallasDeCategoria(undefined, todas, false)).toHaveLength(5);
  });
});

describe("gruposDeTallas", () => {
  const t = (v: string) => ({ id: v, valor: v });
  const ropa = ["XS", "S", "M", "L", "XL", "XXL", "Estándar"].map(t);
  it("habituales adelante, las otras después y «Estándar» aparte", () => {
    const g = gruposDeTallas(ropa, ["S", "M", "L"]);
    expect(g.unica).toBeNull();
    expect(g.habituales.map((x) => x.valor)).toEqual(["S", "M", "L"]);
    expect(g.otras.map((x) => x.valor)).toEqual(["XS", "XL", "XXL"]);
    expect(g.estandar?.valor).toBe("Estándar");
  });
  it("una sola talla (aretes: «Única») se pone sola", () => {
    expect(gruposDeTallas([t("Única")], ["Única"]).unica?.valor).toBe("Única");
  });
  it("sin curva habitual, todas adelante", () => {
    const g = gruposDeTallas([t("26"), t("28")], undefined);
    expect(g.habituales.map((x) => x.valor)).toEqual(["26", "28"]);
    expect(g.otras).toEqual([]);
    expect(g.estandar).toBeNull();
  });
  it("no repite ni pierde tallas", () => {
    const g = gruposDeTallas(ropa, ["S", "M", "L"]);
    const juntas = [...g.habituales, ...g.otras, ...(g.estandar ? [g.estandar] : [])].map((x) => x.valor).sort();
    expect(juntas).toEqual(ropa.map((x) => x.valor).sort());
  });
});

describe("usoDeColores / opcionesDeColor", () => {
  const categorias = [{ id: "pan", nombre: "Pantalones" }, { id: "bla", nombre: "Blusas" }];
  const colores = [
    { codigo: "NEG", nombre: "Negro", hex: "#000", familiaColor: "neutro" },
    { codigo: "BEI", nombre: "Beige", hex: "#eee", familiaColor: "neutro" },
    { codigo: "AZM", nombre: "Azul marino", hex: "#009", familiaColor: "azul" },
  ];
  const uso = usoDeColores(
    [
      { categoria: "Pantalones", color: "Azul marino" },
      { categoria: "Pantalones", color: "Azul marino" },
      { categoria: "Pantalones", color: "Negro" },
      { categoria: "Blusas", color: "Beige" },
      { categoria: null, color: "Negro" },
    ],
    categorias,
    colores,
  );
  it("cuenta por categoría y color, por nombre", () => {
    expect(uso).toEqual({ pan: { AZM: 2, NEG: 1 }, bla: { BEI: 1 } });
  });
  it("primero los usados en la categoría (más usado arriba) y después el resto, sin repetir", () => {
    const o = opcionesDeColor(colores, uso.pan);
    expect(o.map((x) => x.valor)).toEqual(["AZM", "NEG", "BEI"]);
    expect(o[0]!.detalle).toBe("Más usado");
    expect(o[2]!.detalle).toBe("Neutro");
  });
  it("sin categoría o sin uso: todos, agrupados por familia", () => {
    expect(opcionesDeColor(colores, undefined).map((x) => x.valor)).toEqual(["NEG", "BEI", "AZM"]);
  });
});

describe("sugerirDescripcion", () => {
  it("Categoría · Color · Talla, con lo elegido", () => {
    expect(sugerirDescripcion("Pantalones", "Negro", "28")).toBe("Pantalones · Negro · Talla 28");
  });
  it("sin los tres datos no sugiere nada", () => {
    expect(sugerirDescripcion("Pantalones", null, "28")).toBeNull();
    expect(sugerirDescripcion(null, "Negro", "28")).toBeNull();
  });
});
