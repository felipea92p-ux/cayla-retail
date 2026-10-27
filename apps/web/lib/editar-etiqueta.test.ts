import { describe, expect, it } from "vitest";
import { cambioDeNombre } from "./editar-etiqueta";

describe("cambioDeNombre", () => {
  it("el mismo nombre no es un cambio", () => {
    expect(cambioDeNombre("Dia del perro", "Dia del perro")).toBe(false);
  });
  it("un espacio de más en los bordes o en medio no es un cambio", () => {
    expect(cambioDeNombre("Dia del perro", "  Dia del perro ")).toBe(false);
    expect(cambioDeNombre("Dia del perro", "Dia  del   perro")).toBe(false);
  });
  it("corregir una tilde o una mayúscula sí es un cambio", () => {
    expect(cambioDeNombre("Dia del perro", "Día del perro")).toBe(true);
    expect(cambioDeNombre("dia del perro", "Dia del perro")).toBe(true);
  });
  it("corregir una letra sí es un cambio", () => {
    expect(cambioDeNombre("Dia del pero", "Dia del perro")).toBe(true);
  });
  it("un nombre vacío no es un cambio", () => {
    expect(cambioDeNombre("Dia del perro", "")).toBe(false);
    expect(cambioDeNombre("Dia del perro", "   ")).toBe(false);
  });
});
