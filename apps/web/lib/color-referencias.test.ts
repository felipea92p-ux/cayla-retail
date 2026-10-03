import { describe, expect, it } from "vitest";
import {
  alternarCombinaCon,
  MAX_COMBINA_CON,
  MAX_DESCRIPCION,
  MAX_SINONIMOS,
  normalizarCombinaCon,
  normalizarDescripcion,
  normalizarPantone,
  normalizarSinonimos,
} from "./color-referencias";

describe("normalizarPantone", () => {
  it("deja el código como lo guarda la base, lo escriban como lo escriban", () => {
    expect(normalizarPantone("19-1557 TCX")).toBe("19-1557 TCX");
    expect(normalizarPantone("19-1557")).toBe("19-1557 TCX");
    expect(normalizarPantone(" 19 1557 tcx ")).toBe("19-1557 TCX");
    expect(normalizarPantone("191557")).toBe("19-1557 TCX");
  });

  it("vacío es «sin código», y lo que no tiene la forma se rechaza", () => {
    expect(normalizarPantone("")).toBeNull();
    expect(normalizarPantone(null)).toBeNull();
    expect(normalizarPantone("Chili Pepper")).toBe("invalido");
    expect(normalizarPantone("19-155")).toBe("invalido");
    expect(normalizarPantone("19-1557 TPG")).toBe("invalido");
  });
});

describe("normalizarSinonimos", () => {
  it("parte por comas, punto y coma o renglones, y limpia espacios", () => {
    expect(normalizarSinonimos("guinda,  burdeos ; borgoña\ngranate")).toEqual(["guinda", "burdeos", "borgoña", "granate"]);
  });

  it("sin vacíos ni repetidos, aunque cambien tildes o mayúsculas", () => {
    expect(normalizarSinonimos(["Café", "cafe", " ", "CAFÉ", "moka"])).toEqual(["Café", "moka"]);
  });

  it("nunca repite el propio nombre del color", () => {
    expect(normalizarSinonimos(["gris", "plomo"], "Gris")).toEqual(["plomo"]);
  });

  it("tiene un tope", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `sinónimo ${i}`);
    expect(normalizarSinonimos(muchos)).toHaveLength(MAX_SINONIMOS);
  });
});

describe("normalizarDescripcion", () => {
  it("deja el texto sin espacios de más y sin saltos sueltos", () => {
    expect(normalizarDescripcion("  Luminoso   y limpio.\n Da frescura.  ")).toBe("Luminoso y limpio. Da frescura.");
  });

  it("vacía, en blanco o ausente es null (la base guarda null, no una cadena vacía)", () => {
    for (const nada of ["", "   ", "\n\t", null, undefined]) expect(normalizarDescripcion(nada)).toBeNull();
  });

  it("el tope es el de la base: 300 pasa, 301 es inválida", () => {
    expect(normalizarDescripcion("a".repeat(MAX_DESCRIPCION))).toHaveLength(MAX_DESCRIPCION);
    expect(normalizarDescripcion("a".repeat(MAX_DESCRIPCION + 1))).toBe("invalido");
  });

  it("los espacios no cuentan para el tope: se limpian antes de medir", () => {
    expect(normalizarDescripcion("a".repeat(MAX_DESCRIPCION) + "      ")).toHaveLength(MAX_DESCRIPCION);
  });
});

describe("normalizarCombinaCon", () => {
  it("lista de códigos limpia: mayúsculas, sin espacios, sin repetidos, sin el propio color", () => {
    expect(normalizarCombinaCon([" neg ", "BLA", "NEG", "cam", "ROJ"], "roj")).toEqual(["NEG", "BLA", "CAM"]);
  });

  it("vacía o ausente es la lista vacía", () => {
    for (const nada of [[], null, undefined, ""]) expect(normalizarCombinaCon(nada)).toEqual([]);
  });

  it("algo que no es un código de 3 letras es inválido, no se corrige a escondidas", () => {
    for (const malo of [["NEGRO"], ["N1G"], ["NE"], [""], [5], [null], ["N G"]]) expect(normalizarCombinaCon(malo)).toBe("invalido");
    expect(normalizarCombinaCon("NEG")).toBe("invalido"); // un texto suelto no es una lista
    expect(normalizarCombinaCon({})).toBe("invalido");
  });

  it("el tope es el de la base: 8 pasan, 9 son inválidas", () => {
    const nueve = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III"];
    expect(normalizarCombinaCon(nueve.slice(0, MAX_COMBINA_CON))).toHaveLength(MAX_COMBINA_CON);
    expect(normalizarCombinaCon(nueve)).toBe("invalido");
  });

  it("los repetidos y el propio no cuentan para el tope", () => {
    const con = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "AAA", "PPP"];
    expect(normalizarCombinaCon(con, "PPP")).toHaveLength(8);
  });
});

describe("alternarCombinaCon", () => {
  it("suma al final y quita, sin tocar el orden de los demás", () => {
    expect(alternarCombinaCon(["NEG", "BLA"], "CAM")).toEqual(["NEG", "BLA", "CAM"]);
    expect(alternarCombinaCon(["NEG", "BLA", "CAM"], "BLA")).toEqual(["NEG", "CAM"]);
  });

  it("con la lista llena, sumar no hace nada; quitar siempre se puede", () => {
    const llena = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];
    expect(alternarCombinaCon(llena, "ZZZ")).toEqual(llena);
    expect(alternarCombinaCon(llena, "AAA")).toHaveLength(MAX_COMBINA_CON - 1);
  });

  it("no modifica la lista que recibe", () => {
    const original = ["NEG"];
    alternarCombinaCon(original, "BLA");
    expect(original).toEqual(["NEG"]);
  });
});

