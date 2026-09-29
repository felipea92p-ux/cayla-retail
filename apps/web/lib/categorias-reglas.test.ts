import { describe, expect, it } from "vitest";
import { buscarCategorias } from "./categorias-reglas";

const filas = [
  { id: "blu", nombre: "Blusas", prefijo: "BLU", categoriaPadreId: null },
  { id: "ves", nombre: "Vestidos", prefijo: "VES", categoriaPadreId: null },
  { id: "vla", nombre: "Vestidos largos", prefijo: "VLA", categoriaPadreId: "ves" },
  { id: "pan", nombre: "Pantalones", prefijo: "PAN", categoriaPadreId: null },
  { id: "bań", nombre: "Ropa de baño", prefijo: "RBA", categoriaPadreId: null },
];

describe("buscarCategorias", () => {
  it("sin nada escrito, no filtra", () => {
    expect(buscarCategorias(filas, "   ")).toBeNull();
  });
  it("por nombre, sin tildes ni mayúsculas", () => {
    expect([...buscarCategorias(filas, "BANO")!.keys()]).toEqual(["bań"]);
  });
  it("por prefijo", () => {
    expect([...buscarCategorias(filas, "pan")!.keys()]).toEqual(["pan"]);
  });
  it("una subcategoría que responde trae a su padre y dice por cuál", () => {
    const r = buscarCategorias(filas, "largos")!;
    expect(r.get("ves")).toEqual(["Vestidos largos"]);
    expect(r.has("vla")).toBe(true);
  });
  it("el padre que responde por sí mismo también anota a la hija que respondió", () => {
    const r = buscarCategorias(filas, "vestidos")!;
    expect(r.get("ves")).toEqual(["Vestidos largos"]);
  });
  it("nada coincide, nada", () => {
    expect(buscarCategorias(filas, "zapatos")!.size).toBe(0);
  });
});
