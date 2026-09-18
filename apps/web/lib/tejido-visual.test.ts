import { describe, it, expect } from "vitest";
import { familiaDeTejido } from "./tejido-visual";

// Los 17 tejidos reales sembrados en 20260918140000_tejidos_seed.sql. Si uno
// cae en `null`, la pantalla lo pinta como "sin muestra" y se pierde justo la
// ayuda visual que se quería dar al elegir tela.
describe("familiaDeTejido — el vocabulario que ya existe", () => {
  it.each([
    ["Algodón", "algodon"],
    ["Algodón pima", "pima"],
    ["Alpaca", "alpaca"],
    ["Denim", "denim"],
    ["Drill", "drill"],
    ["Gabardina", "gabardina"],
    ["Jersey", "jersey"],
    ["Licra", "licra"],
    ["Lino", "lino"],
    ["Pana", "pana"],
    ["Piqué", "pique"],
    ["Polar", "polar"],
    ["Poliéster", "poliester"],
    ["Popelina", "popelina"],
    ["Rib", "rib"],
    ["Seda", "seda"],
    ["Viscosa", "viscosa"],
  ] as const)("%s → %s", (nombre, familia) => {
    expect(familiaDeTejido(nombre)).toBe(familia);
  });
});

describe("familiaDeTejido — nombres que un Líder podría agregar mañana", () => {
  it("los nombres de Gamarra que las notas del seed dicen cubrir", () => {
    expect(familiaDeTejido("Full Lycra")).toBe("licra");
    expect(familiaDeTejido("Interlock")).toBe("jersey");
    expect(familiaDeTejido("Rib licrado")).toBe("rib");
  });

  it("Algodón pima no se confunde con Algodón, ni Rib licrado con Licra", () => {
    expect(familiaDeTejido("Algodón pima")).toBe("pima");
    expect(familiaDeTejido("Algodón orgánico")).toBe("algodon");
    expect(familiaDeTejido("Rib licrado")).not.toBe("licra");
  });

  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(familiaDeTejido("  PIQUÉ ")).toBe("pique");
    expect(familiaDeTejido("POLIÉSTER")).toBe("poliester");
  });

  it("un nombre desconocido devuelve null (la pantalla dice «Sin muestra»)", () => {
    expect(familiaDeTejido("Tul")).toBeNull();
    expect(familiaDeTejido("")).toBeNull();
  });
});
