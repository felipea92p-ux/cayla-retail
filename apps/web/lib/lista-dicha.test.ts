import { describe, expect, it } from "vitest";
import { listaDicha, prendaDicha } from "./lista-dicha";

// La lista dicha en castellano (ADR-0716, caso 7): reemplaza a los `.join(" · ")` y a las veinte copias de `Intl.ListFormat`.
describe("listaDicha", () => {
  it("dice la lista como se habla: «a», «a y b», «a, b y c»", () => {
    expect(listaDicha([])).toBe("");
    expect(listaDicha(["3 negro"])).toBe("3 negro");
    expect(listaDicha(["3 negro", "2 beige"])).toBe("3 negro y 2 beige");
    expect(listaDicha(["3 negro", "2 beige", "1 crudo"])).toBe("3 negro, 2 beige y 1 crudo");
  });

  it("no dice lo vacío: ni un null, ni un false, ni un texto en blanco", () => {
    expect(listaDicha(["Ana", null, undefined, false, "  ", "Luis"])).toBe("Ana y Luis");
  });

  it("con «o» es una disyunción: «talla: S, M o L»", () => {
    expect(listaDicha(["S", "M", "L"], "o")).toBe("S, M o L");
  });
});

describe("prendaDicha", () => {
  it("dice la prenda como la tienda online: el color en minúscula si no abre la frase y la talla con su palabra", () => {
    expect(prendaDicha({ nombre: "Blusa Emma", color: "Azul Marino", talla: "M" })).toBe("Blusa Emma, azul marino, talla M");
    expect(prendaDicha({ color: "Negro", talla: "M" })).toBe("Negro, talla M");
    expect(prendaDicha({ talla: "Única" })).toBe("Talla Única");
    expect(prendaDicha({ nombre: "Polo", color: null, talla: "  " })).toBe("Polo");
    expect(prendaDicha({})).toBe("");
  });
});
