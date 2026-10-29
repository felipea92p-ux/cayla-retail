import { describe, expect, it } from "vitest";
import { compararTallas, matricesDeRecepcion } from "./recepcion-matriz-reglas";

const l = (referencia: string, color: string | null, talla: string | null, cantidad: number) => ({ referencia, sku: null, color, talla, cantidad });

describe("matricesDeRecepcion", () => {
  it("arma una matriz por modelo con colores en filas y tallas en columnas", () => {
    const [m] = matricesDeRecepcion([l("Blusa", "Rosado", "M", 8), l("Blusa", "Blanco", "S", 12), l("Blusa", "Rosado", "S", 2)]);
    expect(m.tallas).toEqual(["S", "M"]);
    expect(m.colores.find((c) => c.color === "Rosado")).toMatchObject({ porTalla: { M: 8, S: 2 }, total: 10 });
    expect(m.total).toBe(22);
  });
  it("separa modelos y suma líneas repetidas", () => {
    const r = matricesDeRecepcion([l("A", "Rojo", "M", 1), l("B", "Rojo", "M", 3), l("A", "Rojo", "M", 4)]);
    expect(r.map((x) => [x.modelo, x.total])).toEqual([["A", 5], ["B", 3]]);
  });
  it("sin talla ni color usa «Única» y «Sin color»", () => {
    const [m] = matricesDeRecepcion([l("Bolsa", null, null, 5)]);
    expect(m.tallas).toEqual(["Única"]);
    expect(m.colores[0].color).toBe("Sin color");
  });
  it("ordena tallas de letra, luego números, luego lo demás", () => {
    expect(["L", "38", "Única", "S", "XL", "M", "36"].sort(compararTallas)).toEqual(["S", "M", "L", "XL", "36", "38", "Única"]);
  });
});
