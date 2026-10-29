import { describe, expect, it } from "vitest";
import { podioDeCategoria } from "./recepcion-podio-reglas";

describe("podioDeCategoria", () => {
  it("cuatro columnas a la escala de la mayor, con la llave que dice si cuadra", () => {
    const p = podioDeCategoria({ dijeron: 4, contadas: 4, alStock: 3, paraDespues: 1 });
    expect(p.columnas.map((c) => [c.titulo, c.n, c.alto])).toEqual([
      ["Dijeron", 4, 100],
      ["Contaste", 4, 100],
      ["Se venden", 3, 75],
      ["Después", 1, 25],
    ]);
    expect(p.llave).toEqual({ texto: "cuadra", cuadra: true });
  });

  it("la llave dice cuántas faltan o sobran", () => {
    expect(podioDeCategoria({ dijeron: 5, contadas: 3, alStock: 0, paraDespues: 3 }).llave).toEqual({ texto: "faltan 2", cuadra: false });
    expect(podioDeCategoria({ dijeron: 2, contadas: 5, alStock: 5, paraDespues: 0 }).llave).toEqual({ texto: "sobran 3", cuadra: false });
  });

  it("sin guía no hay «Dijeron» ni llave", () => {
    const p = podioDeCategoria({ dijeron: null, contadas: 6, alStock: 2, paraDespues: 4 });
    expect(p.columnas.map((c) => c.clave)).toEqual(["contaste", "vender", "despues"]);
    expect(p.llave).toBeNull();
  });

  it("todo en cero no divide entre cero", () => {
    expect(podioDeCategoria({ dijeron: 0, contadas: 0, alStock: 0, paraDespues: 0 }).columnas.every((c) => c.alto === 0)).toBe(true);
  });
});
