import { describe, expect, it } from "vitest";
import {
  agregarColorDeVariante,
  alternarColor,
  alternarVariante,
  elegidasDelModelo,
  fijarVariantesDelModelo,
  modelosDeLaSeleccion,
  ordenarTallas,
  porColor,
  resumenDeVariantes,
  variantesDichas,
  variantesPorModelo,
  type VarianteDeModelo,
} from "./oferta-variantes";

const v = (id: string, colorClave: string, color: string | null, talla: string | null): VarianteDeModelo => ({ id, colorClave, color, talla });
// Blusa Emma: negro en S, M, L y blanco en S, M.
const EMMA = [v("nS", "NEG", "Negro", "S"), v("nM", "NEG", "Negro", "M"), v("nL", "NEG", "Negro", "L"), v("bS", "BLA", "Blanco", "S"), v("bM", "BLA", "Blanco", "M")];
const vacia = { productosSolo: [], variantesSolo: [] };
const entera = { productosSolo: ["emma"], variantesSolo: [] };

describe("las tallas y colores sueltos de una prenda en una oferta (ADR-0682)", () => {
  it("entera, la oferta alcanza todas sus variantes; por variantes, solo las sueltas", () => {
    expect([...elegidasDelModelo(entera, "emma", EMMA)]).toEqual(["nS", "nM", "nL", "bS", "bM"]);
    expect([...elegidasDelModelo({ productosSolo: [], variantesSolo: ["nM", "otra"] }, "emma", EMMA)]).toEqual(["nM"]);
    expect(elegidasDelModelo(vacia, "emma", EMMA).size).toBe(0);
  });

  it("quitar una talla de una prenda entera la deja por sus variantes: las demás siguen", () => {
    const s = alternarVariante(entera, "emma", EMMA, "nL");
    expect(s.productosSolo).toEqual([]);
    expect(s.variantesSolo).toEqual(["nS", "nM", "bS", "bM"]);
  });

  it("al volver a marcar la que faltaba, la prenda vuelve a estar entera (y no quedan variantes sueltas suyas)", () => {
    const s = alternarVariante({ productosSolo: [], variantesSolo: ["nS", "nM", "bS", "bM"] }, "emma", EMMA, "nL");
    expect(s).toEqual({ productosSolo: ["emma"], variantesSolo: [] });
  });

  it("tocar un color lo mete entero; tocarlo de nuevo lo saca entero", () => {
    const conNegro = alternarColor(vacia, "emma", EMMA, "NEG");
    expect(conNegro).toEqual({ productosSolo: [], variantesSolo: ["nS", "nM", "nL"] });
    expect(alternarColor(conNegro, "emma", EMMA, "NEG")).toEqual({ productosSolo: [], variantesSolo: [] });
    // Con una sola talla del color, tocar el color las completa (no las saca).
    expect(alternarColor({ productosSolo: [], variantesSolo: ["nS"] }, "emma", EMMA, "NEG").variantesSolo).toEqual(["nS", "nM", "nL"]);
  });

  it("sin ninguna variante, la prenda sale de la oferta; las de otros modelos no se tocan", () => {
    const s = fijarVariantesDelModelo({ productosSolo: ["otra", "emma"], variantesSolo: ["x1"] }, "emma", EMMA, new Set());
    expect(s).toEqual({ productosSolo: ["otra"], variantesSolo: ["x1"] });
    const t = alternarVariante({ productosSolo: ["otra"], variantesSolo: ["x1", "nS"] }, "emma", EMMA, "nS");
    expect(t).toEqual({ productosSolo: ["otra"], variantesSolo: ["x1"] });
  });

  it("nunca deja una prenda entera Y con variantes sueltas a la vez", () => {
    let s: { productosSolo: string[]; variantesSolo: string[] } = { productosSolo: [], variantesSolo: [] };
    for (const id of ["nS", "bM", "nM", "nL", "bS", "nM", "bS", "bS", "nM"]) {
      s = alternarVariante(s, "emma", EMMA, id);
      const suyas = s.variantesSolo.filter((x) => EMMA.some((e) => e.id === x));
      expect(s.productosSolo.includes("emma") && suyas.length > 0, id).toBe(false);
      expect(new Set(s.variantesSolo).size).toBe(s.variantesSolo.length);
    }
  });

  it("los modelos de la oferta, enteros o por variantes, en el orden en que entraron y sin repetir", () => {
    const modeloDe = (id: string) => ({ nS: "emma", nM: "emma", f1: "falda" })[id];
    expect(modelosDeLaSeleccion({ productosSolo: ["casaca"], variantesSolo: ["nS", "f1", "nM", "huerfana"] }, modeloDe)).toEqual(["casaca", "emma", "falda"]);
  });
});

describe("lo que la oferta lleva de un modelo, en una línea", () => {
  const dice = (ids: string[]) => resumenDeVariantes(EMMA, new Set(ids));
  it("todo, un color entero, tallas sueltas y mezclas", () => {
    expect(dice(["nS", "nM", "nL", "bS", "bM"])).toBe("Todo el modelo");
    expect(dice(["nS", "nM", "nL"])).toBe("Negro");
    expect(dice(["nM"])).toBe("Negro M");
    expect(dice(["nS", "nM"])).toBe("Negro S y M");
    expect(dice(["nS", "nM", "bS", "bM"])).toBe("Negro S y M · Blanco");
    expect(dice([])).toBe("");
  });

  it("un modelo sin colores dice solo sus tallas; uno de talla única, eso", () => {
    const sinColor = [v("a", "", null, "S"), v("b", "", null, "M"), v("c", "", null, "L")];
    expect(resumenDeVariantes(sinColor, new Set(["a", "c"]))).toBe("S y L");
    const unica = [v("u1", "NEG", "Negro", null), v("u2", "BLA", "Blanco", null)];
    expect(resumenDeVariantes(unica, new Set(["u2"]))).toBe("Blanco");
  });
});

describe("el orden de la percha", () => {
  it("XS, S, M, L, XL; después las numéricas; después lo demás", () => {
    const t = (talla: string | null) => ({ talla });
    expect(ordenarTallas([t("L"), t("36"), t("XS"), t("Única"), t("M"), t("28"), t("XL"), t("S")]).map((x) => x.talla)).toEqual(["XS", "S", "M", "L", "XL", "28", "36", "Única"]);
  });

  it("junta por color en el orden en que llegan, con sus tallas ordenadas", () => {
    const g = porColor([v("1", "NEG", "Negro", "L"), v("2", "BLA", "Blanco", "M"), v("3", "NEG", "Negro", "S")]);
    expect(g.map((x) => `${x.color}:${x.variantes.map((y) => y.talla).join("")}`)).toEqual(["Negro:SL", "Blanco:M"]);
  });
});

describe("leer una etiqueta agrega ese color con todas sus tallas (ADR-0682)", () => {
  it("la primera lectura de un modelo de dos colores deja el color leído, con sus tres tallas", () => {
    const r = agregarColorDeVariante(vacia, "emma", EMMA, "nM");
    expect(r).toEqual({ productosSolo: [], variantesSolo: ["nS", "nM", "nL"], cambio: true, color: "Negro" });
  });

  it("leer otra talla del mismo color no cambia nada; leer el otro color completa el modelo, que queda entero", () => {
    const negro = agregarColorDeVariante(vacia, "emma", EMMA, "nM");
    expect(agregarColorDeVariante(negro, "emma", EMMA, "nL").cambio).toBe(false);
    const todo = agregarColorDeVariante(negro, "emma", EMMA, "bS");
    expect(todo).toEqual({ productosSolo: ["emma"], variantesSolo: [], cambio: true, color: null });
  });

  it("se suma a las tallas sueltas que el modelo ya tenía, sin tocar las de otros modelos", () => {
    const r = agregarColorDeVariante({ productosSolo: ["otro"], variantesSolo: ["bS", "x1"] }, "emma", EMMA, "nS");
    expect(r.productosSolo).toEqual(["otro"]);
    expect(r.variantesSolo).toEqual(["x1", "nS", "nM", "nL", "bS"]);
    expect(r.color).toBe("Negro");
  });

  it("un modelo de un solo color entra entero; uno que ya estaba entero no cambia", () => {
    const uno = [v("a", "NEG", "Negro", "S"), v("b", "NEG", "Negro", "M")];
    expect(agregarColorDeVariante(vacia, "falda", uno, "a")).toEqual({ productosSolo: ["falda"], variantesSolo: [], cambio: true, color: null });
    expect(agregarColorDeVariante(entera, "emma", EMMA, "nM").cambio).toBe(false);
  });

  it("una etiqueta que la pantalla no conoce como talla de ese modelo agrega el modelo entero, y se lleva sus tallas sueltas", () => {
    expect(agregarColorDeVariante({ productosSolo: [], variantesSolo: ["nS"] }, "emma", EMMA, null)).toEqual({ productosSolo: ["emma"], variantesSolo: [], cambio: true, color: null });
    expect(agregarColorDeVariante(vacia, "sin-datos", [], "zz")).toEqual({ productosSolo: ["sin-datos"], variantesSolo: [], cambio: true, color: null });
  });
});

describe("decir las tallas sueltas de una oferta", () => {
  const d = {
    modeloDe: (id: string) => (EMMA.some((x) => x.id === id) ? "emma" : id.startsWith("f") ? "falda" : undefined),
    nombreDe: (id: string) => ({ emma: "Blusa Emma", falda: "Falda Renata" })[id],
    variantesDe: (id: string) => (id === "emma" ? EMMA : []),
  };
  it("un solo modelo se nombra con lo que lleva; varios se cuentan", () => {
    expect(variantesDichas(["nS", "nM"], d)).toEqual({ modelos: 1, unico: "Blusa Emma (Negro S y M)" });
    expect(variantesDichas(["nS", "f1"], d)).toEqual({ modelos: 2, unico: null });
    expect(variantesDichas([], d)).toEqual({ modelos: 0, unico: null });
  });

  it("las que la pantalla ya no conoce cuentan juntas como un modelo, sin nombre", () => {
    expect(variantesDichas(["zz", "yy"], d)).toEqual({ modelos: 1, unico: null });
    expect(variantesDichas(["zz", "nM"], d)).toEqual({ modelos: 2, unico: null });
  });
});

describe("las variantes de cada modelo, con las prendas de la pantalla", () => {
  it("la llave del color sale de «modelo·color»; el nombre, de la vitrina, y si no hay, la llave", () => {
    const prendas = [
      { id: "1", productoId: "emma", modelo: "emma·NEG", talla: "S" },
      { id: "2", productoId: "emma", modelo: "emma·BEI", talla: "M" },
      { id: "3", nombre: "sin modelo" },
    ];
    const m = variantesPorModelo(prendas, (id) => (id === "1" ? { colorNombre: "Negro", colorHex: "#000" } : undefined));
    expect([...m.keys()]).toEqual(["emma"]);
    expect(m.get("emma")).toEqual([
      { id: "1", colorClave: "NEG", color: "Negro", colorHex: "#000", talla: "S" },
      { id: "2", colorClave: "BEI", color: "BEI", colorHex: null, talla: "M" },
    ]);
  });
});
