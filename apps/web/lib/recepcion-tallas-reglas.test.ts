import { describe, expect, it } from "vitest";
import type { VarianteSeparada } from "./recepcion-conteo-reglas";
import { matrizDe, type Conteo, type PrendaRecepcion, type TallaDeLaCategoria, type VarianteRecepcion } from "./recepcion-envio-reglas";
import {
  coloresIniciales,
  coloresPorAgregar,
  cuadreDeTallas,
  mismasVariantes,
  ordenarTallasVisibles,
  quitarColor,
  quitarTalla,
  tallasIniciales,
  tallasListas,
  tallasPorAgregar,
} from "./recepcion-tallas-reglas";

const CATEGORIA: TallaDeLaCategoria[] = [
  { id: "xs", valor: "XS", habitual: false },
  { id: "s", valor: "S", habitual: true },
  { id: "m", valor: "M", habitual: true },
  { id: "l", valor: "L", habitual: true },
  { id: "xl", valor: "XL", habitual: false },
  { id: "xxl", valor: "XXL", habitual: false },
];

const variante = (talla: string, color: string): VarianteRecepcion => ({
  id: `${talla}-${color}`,
  tallaId: talla,
  talla: talla.toUpperCase(),
  colorCodigo: color,
  color: color === "neg" ? "Negro" : "Crema",
  codigo: null,
  costo: null,
  precio: null,
});

const prenda = (...variantes: VarianteRecepcion[]): Pick<PrendaRecepcion, "variantes"> => ({ variantes });
const COMPLETA = prenda(...["xs", "s", "m", "l", "xl"].flatMap((t) => [variante(t, "neg"), variante(t, "cre")]));
const conteo = (cantidades: Record<string, string> = {}, extra: Partial<Conteo> = {}): Conteo => ({ cantidades, danadas: {}, conDanadas: false, arreglo: null, ...extra });

describe("con qué arranca la tabla", () => {
  it("con las tallas de siempre de la categoría, aunque la prenda tenga más", () => {
    expect(tallasIniciales(matrizDe(COMPLETA), COMPLETA, CATEGORIA, conteo())).toEqual(["s", "m", "l"]);
  });

  it("lo que ya trae cantidad no se esconde", () => {
    expect(tallasIniciales(matrizDe(COMPLETA), COMPLETA, CATEGORIA, conteo({ "xl-neg": "4" }))).toEqual(["s", "m", "l", "xl"]);
  });

  it("si la prenda no tiene ninguna de las de siempre, todas las suyas", () => {
    const soloGrandes = prenda(variante("xl", "neg"), variante("xxl", "neg"));
    expect(tallasIniciales(matrizDe(soloGrandes), soloGrandes, CATEGORIA, conteo())).toEqual(["xl", "xxl"]);
  });

  it("una prenda sin talla sigue teniendo su columna", () => {
    const unica = prenda({ ...variante("x", "neg"), tallaId: null, talla: null, id: "u" });
    expect(tallasIniciales(matrizDe(unica), unica, CATEGORIA, conteo())).toEqual([""]);
  });

  it("todos los colores de la prenda; si ya hay cantidades, solo esos", () => {
    expect(coloresIniciales(matrizDe(COMPLETA), COMPLETA, conteo()).sort()).toEqual(["cre", "neg"]);
    expect(coloresIniciales(matrizDe(COMPLETA), COMPLETA, conteo({ "s-neg": "2" }))).toEqual(["neg"]);
  });
});

describe("agregar", () => {
  it("primero lo que la prenda tiene y está escondido, y después lo que la categoría ofrece", () => {
    const lista = tallasPorAgregar(matrizDe(COMPLETA), ["s", "m", "l"], CATEGORIA);
    expect(lista).toEqual([
      { clave: "xs", texto: "XS", crear: false },
      { clave: "xl", texto: "XL", crear: false },
      { clave: "xxl", texto: "XXL", crear: true },
    ]);
  });

  it("entre lo que falta crear, primero las de siempre", () => {
    const soloUna = prenda(variante("xl", "neg"));
    expect(tallasPorAgregar(matrizDe(soloUna), ["xl"], CATEGORIA).map((t) => t.texto)).toEqual(["S", "M", "L", "XS", "XXL"]);
  });

  it("nada que agregar si ya está todo", () => {
    const todas = CATEGORIA.map((t) => t.id);
    const entera = prenda(...todas.map((t) => variante(t, "neg")));
    expect(tallasPorAgregar(matrizDe(entera), todas, CATEGORIA)).toEqual([]);
  });

  it("una talla nueva cae en su lugar de la curva", () => {
    expect(ordenarTallasVisibles(matrizDe(COMPLETA), ["s", "m", "l", "xs"])).toEqual(["xs", "s", "m", "l"]);
  });

  it("los colores: los escondidos de la prenda y después los del catálogo", () => {
    const lista = coloresPorAgregar(matrizDe(COMPLETA), ["neg"], [
      { codigo: "neg", nombre: "Negro" },
      { codigo: "cre", nombre: "Crema" },
      { codigo: "vin", nombre: "Vino" },
    ]);
    expect(lista).toEqual([
      { clave: "cre", texto: "Crema", crear: false },
      { clave: "vin", texto: "Vino", crear: true },
    ]);
  });
});

describe("quitar", () => {
  it("una talla se lleva sus cantidades y sus dañadas, y dice cuántas había", () => {
    const antes = conteo({ "xs-neg": "3", "xs-cre": "2", "s-neg": "9" }, { danadas: { "xs-neg": "1" }, conDanadas: true });
    const r = quitarTalla(antes, COMPLETA, "xs");
    expect(r.perdidas).toBe(5);
    expect(r.conteo.cantidades).toEqual({ "s-neg": "9" });
    expect(r.conteo.danadas).toEqual({});
    expect(antes.cantidades["xs-neg"]).toBe("3");
  });

  it("un color también", () => {
    const r = quitarColor(conteo({ "s-neg": "3", "s-cre": "2" }), COMPLETA, "neg");
    expect(r.perdidas).toBe(3);
    expect(r.conteo.cantidades).toEqual({ "s-cre": "2" });
  });

  it("sin cantidades no hay nada que deshacer", () => {
    expect(quitarTalla(conteo(), COMPLETA, "xs").perdidas).toBe(0);
  });
});

describe("cuándo se guarda", () => {
  it("dice lo que falta contra lo contado", () => {
    expect(cuadreDeTallas(conteo(), COMPLETA, 360)).toEqual({ estado: "vacia", texto: "Reparte las 360" });
    expect(cuadreDeTallas(conteo({ "s-neg": "360" }), COMPLETA, 360).estado).toBe("cuadra");
    expect(cuadreDeTallas(conteo({ "s-neg": "300" }), COMPLETA, 360)).toEqual({ estado: "faltan", texto: "Faltan 60 por repartir" });
    expect(cuadreDeTallas(conteo({ "s-neg": "1400" }), COMPLETA, 360)).toEqual({ estado: "sobran", texto: "Te pasaste por 1,040" });
  });

  it("«Cuadra» solo si de verdad se guarda: las dañadas a medias tampoco", () => {
    const base = { "s-neg": "5" };
    const sinArreglo = conteo(base, { conDanadas: true, danadas: { "s-neg": "2" } });
    expect(cuadreDeTallas(sinArreglo, COMPLETA, 5).texto).toBe("Falta decir si tienen arreglo: aún no se guarda");
    const deMas = conteo(base, { conDanadas: true, danadas: { "s-neg": "9" }, arreglo: "pendiente" });
    expect(cuadreDeTallas(deMas, COMPLETA, 5).estado).toBe("danadas");
    const bien = conteo(base, { conDanadas: true, danadas: { "s-neg": "2" }, arreglo: "pendiente" });
    expect(cuadreDeTallas(bien, COMPLETA, 5).estado).toBe("cuadra");
    expect(cuadreDeTallas(conteo(base, { conDanadas: true }), COMPLETA, 5).estado).toBe("cuadra");
  });

  it("dice lo mismo que lo que se guarda", () => {
    const casos: Conteo[] = [
      conteo(),
      conteo({ "s-neg": "5" }),
      conteo({ "s-neg": "4" }),
      conteo({ "s-neg": "6" }),
      conteo({ "s-neg": "5" }, { conDanadas: true }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "2" } }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "9" }, arreglo: "pendiente" }),
      conteo({ "s-neg": "5" }, { conDanadas: true, danadas: { "s-neg": "2" }, arreglo: "sin_solucion" }),
    ];
    for (const c of casos) expect(cuadreDeTallas(c, COMPLETA, 5).estado === "cuadra").toBe(tallasListas(c, COMPLETA, 5));
  });

  it("solo con todo repartido: en la base las tallas siempre suman la cantidad", () => {
    expect(tallasListas(conteo({ "s-neg": "5" }), COMPLETA, 5)).toBe(true);
    expect(tallasListas(conteo({ "s-neg": "4" }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "6" }), COMPLETA, 5)).toBe(false);
  });

  it("sin nada contado o sin prenda, no", () => {
    expect(tallasListas(conteo(), COMPLETA, 0)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }), null, 5)).toBe(false);
  });

  it("una cantidad imposible no pasa", () => {
    expect(tallasListas(conteo({ "s-neg": "abc" }), COMPLETA, 5)).toBe(false);
  });

  it("con dañadas: ninguna de más, y dicho si tienen arreglo", () => {
    const base = { conDanadas: true } as const;
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "6" }, arreglo: "pendiente" }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "2" } }), COMPLETA, 5)).toBe(false);
    expect(tallasListas(conteo({ "s-neg": "5" }, { ...base, danadas: { "s-neg": "2" }, arreglo: "pendiente" }), COMPLETA, 5)).toBe(true);
    expect(tallasListas(conteo({ "s-neg": "5" }, base), COMPLETA, 5)).toBe(true);
  });
});

describe("mismasVariantes", () => {
  const v = (id: string, cantidad: number, danadas = 0): VarianteSeparada => ({ varianteId: id, cantidad, danadas, solucion: danadas > 0 ? "pendiente" : null, talla: "S", color: "Negro", codigo: null });

  it("el orden no importa", () => {
    expect(mismasVariantes([v("a", 1), v("b", 2)], [v("b", 2), v("a", 1)])).toBe(true);
  });

  it("una cantidad o una dañada distinta, sí", () => {
    expect(mismasVariantes([v("a", 1)], [v("a", 2)])).toBe(false);
    expect(mismasVariantes([v("a", 2, 1)], [v("a", 2)])).toBe(false);
  });

  it("sin nada y vacío son lo mismo; lo que va en 0 no cuenta", () => {
    expect(mismasVariantes(null, [])).toBe(true);
    expect(mismasVariantes([v("a", 0)], null)).toBe(true);
  });
});
