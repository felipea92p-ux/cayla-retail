import { describe, it, expect } from "vitest";
import { familiaDePatron } from "./patron-visual";

// Estos 7 son el vocabulario real que hoy está cargado en Atributos → Patrones.
// Si alguno cae en `null`, la pantalla lo pinta como "sin muestra" y la clienta
// o la Encargada pierde justo la ayuda visual que se quería dar.
describe("familiaDePatron — el vocabulario que ya existe", () => {
  it.each([
    ["Animal print", "animal"],
    ["Cuadros", "cuadros"],
    ["Estampado", "estampado"],
    ["Floral", "floral"],
    ["Liso", "liso"],
    ["Lunares", "lunares"],
    ["Rayas", "rayas"],
  ] as const)("%s → %s", (nombre, familia) => {
    expect(familiaDePatron(nombre)).toBe(familia);
  });
});

describe("familiaDePatron — nombres que un Líder podría agregar mañana", () => {
  it("variantes del mismo concepto caen en la misma familia", () => {
    expect(familiaDePatron("Rayado")).toBe("rayas");
    expect(familiaDePatron("Tartán")).toBe("cuadros");
    expect(familiaDePatron("Flores pequeñas")).toBe("floral");
    expect(familiaDePatron("Polka")).toBe("lunares");
  });

  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(familiaDePatron("  ANIMAL   PRINT ")).toBe("animal");
    expect(familiaDePatron("ESCOCÉS")).toBe("cuadros");
  });

  it("'animal print' no se confunde con 'estampado' aunque ambos digan print", () => {
    expect(familiaDePatron("Animal print")).toBe("animal");
    expect(familiaDePatron("Print geométrico")).toBe("estampado");
  });

  it("un nombre desconocido no inventa dibujo: devuelve null", () => {
    expect(familiaDePatron("Jacquard")).toBeNull();
    expect(familiaDePatron("")).toBeNull();
  });
});
