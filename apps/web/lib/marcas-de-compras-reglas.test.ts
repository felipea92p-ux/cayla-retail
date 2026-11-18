import { describe, expect, it } from "vitest";
import { idsParaMarcas, leerMarcasDeCompras, tituloDeCompra } from "./marcas-de-compras-reglas";

// ADR-0644. Datos inventados.
describe("las marcas de cada compra", () => {
  it("lee lo que manda la base y descarta lo roto", () => {
    const m = leerMarcasDeCompras([{ id: "c1", marcas: ["Kero", "Lolita"] }, { id: "c2", marcas: [] }, { id: 3, marcas: ["X"] }, null, { id: "c4", marcas: ["", "Nativa"] }]);
    expect([...m]).toEqual([
      ["c1", ["Kero", "Lolita"]],
      ["c4", ["Nativa"]],
    ]);
    expect(leerMarcasDeCompras(null).size).toBe(0);
    expect(leerMarcasDeCompras({ error: "x" }).size).toBe(0);
  });

  it("el título: una, dos, y de tres en adelante «y N más»; sin marcas, nada", () => {
    expect(tituloDeCompra(undefined)).toBeNull();
    expect(tituloDeCompra([])).toBeNull();
    expect(tituloDeCompra(["Kero"])).toBe("Kero");
    expect(tituloDeCompra(["Kero", "Lolita"])).toBe("Kero · Lolita");
    expect(tituloDeCompra(["Kero", "Lolita", "Mia Rose"])).toBe("Kero y 2 más");
  });

  it("pide cada id una vez y respeta el tope de la base", () => {
    expect(idsParaMarcas(["a", "b", "a"])).toEqual(["a", "b"]);
    expect(idsParaMarcas(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});
