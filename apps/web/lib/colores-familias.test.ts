import { describe, expect, it } from "vitest";
import { agruparPorFamilia, FAMILIAS_COLOR, textoDeFamilia } from "./colores-familias";

describe("textoDeFamilia", () => {
  it("las conocidas, por su nombre", () => {
    expect(textoDeFamilia("rosado")).toBe("Rosado");
    expect(textoDeFamilia("metalico")).toBe("Metálico");
  });

  it("una que el código aún no conoce se lee por su propio valor, no como «Sin familia»", () => {
    expect(textoDeFamilia("turquesa")).toBe("Turquesa");
    expect(textoDeFamilia("azul-petroleo")).toBe("Azul-petroleo");
  });

  it("«Sin familia» es solo para el color que de verdad no tiene", () => {
    for (const nada of [null, undefined, ""]) expect(textoDeFamilia(nada)).toBe("Sin familia");
  });
});

describe("agruparPorFamilia — una sola agrupación para Nuevo producto, Atributos y el filtro", () => {
  const c = (id: string, familia: string | null) => ({ id, familia });
  const lista = [c("a", "azul"), c("n", "neutro"), c("x", "turquesa"), c("s", null), c("r", "rosado"), c("v", ""), c("y", "turquesa")];

  it("las conocidas en el orden del espectro, luego cada desconocida con su nombre, al final «Sin familia»", () => {
    const g = agruparPorFamilia(lista, (x) => x.familia);
    expect(g.map((x) => [x.familia, x.texto])).toEqual([
      ["neutro", "Neutro"],
      ["rosado", "Rosado"],
      ["azul", "Azul"],
      ["turquesa", "Turquesa"],
      ["sin-familia", "Sin familia"],
    ]);
  });

  it("INVARIANTE: ningún color se pierde ni se repite, llegue como llegue", () => {
    for (const entrada of [lista, [...lista].reverse(), [], [c("solo", null)]]) {
      const ids = agruparPorFamilia(entrada, (x) => x.familia).flatMap((g) => g.colores.map((x) => x.id));
      expect(ids.sort()).toEqual(entrada.map((x) => x.id).sort());
    }
  });

  it("una familia sin colores no aparece, y las dos familias nuevas existen en la lista de familias", () => {
    expect(agruparPorFamilia([c("a", "azul")], (x) => x.familia).map((g) => g.familia)).toEqual(["azul"]);
    const valores = FAMILIAS_COLOR.map((f) => f.valor) as string[];
    expect(valores).toEqual(expect.arrayContaining(["rosado", "naranja"]));
  });
});
