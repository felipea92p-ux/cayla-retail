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

// Los tejidos que producción tenía el 2026-10-02 y que salían «Sin muestra» en Atributos ▸ Tejidos, más los nombres que
// ya se dibujaban pero cambiaron de familia al sumar las nuevas (Hilo de algodón dejó de ser un algodón liso).
describe("familiaDeTejido — el vocabulario de producción (2026-10-02)", () => {
  it.each([
    ["Aterciopelada", "terciopelo"],
    ["franela", "franela"],
    ["Gasa", "gasa"],
    ["Hilo", "hilo"],
    ["Hilo de algodón", "hilo"],
    ["Macramé", "macrame"],
    ["Oxford", "oxford"],
    ["Sastre", "sastre"],
    ["Seersucker", "seersucker"],
    ["Suplex", "suplex"],
    ["Tela", "tela"],
    ["Tela mojada", "mojado"],
    // Ya se dibujaban y siguen igual:
    ["lana", "alpaca"],
    ["Satín", "seda"],
    ["Rayón", "viscosa"],
    ["Algodón alicrado", "algodon"],
    ["Mix Algodón & Poliéster", "poliester"],
  ] as const)("%s → %s", (nombre, familia) => {
    expect(familiaDeTejido(nombre)).toBe(familia);
  });

  it("«Tela» solo es el tejido genérico cuando es el nombre entero", () => {
    // Una frase de «Generar dibujo» dice «tela» sin querer decir ese tejido: no puede taparle la palabra «sarga».
    expect(familiaDeTejido("tela gruesa de sarga")).toBeNull();
    expect(familiaDeTejido("Tela de algodón")).toBe("algodon");
    expect(familiaDeTejido("  TELA ")).toBe("tela");
  });

  it("los materiales de bolsa y los cuatro que producción tenía sin muestra (2026-10-11)", () => {
    expect(familiaDeTejido("Papel kraft")).toBe("papel_kraft");
    expect(familiaDeTejido("Papel couché")).toBe("papel_couche");
    expect(familiaDeTejido("Papel opalina")).toBe("papel_opalina");
    expect(familiaDeTejido("cartulina maule")).toBe("papel_opalina");
    expect(familiaDeTejido("TNT")).toBe("tnt");
    expect(familiaDeTejido("Tela no tejida (tokuyo)")).toBe("tnt");
    expect(familiaDeTejido("Organza")).toBe("organza");
    expect(familiaDeTejido("Plástico")).toBe("plastico");
    expect(familiaDeTejido("ENCAJE")).toBe("encaje");
    expect(familiaDeTejido("Gamuza")).toBe("gamuza");
    expect(familiaDeTejido("Gamusa")).toBe("gamuza");
    expect(familiaDeTejido("Mesh")).toBe("mesh");
    expect(familiaDeTejido("catania")).toBe("catania");
  });

  it("«tnt» y «gamuza» se reconocen por palabra entera y con sus variantes", () => {
    // `\b`: «Entrenta» no es TNT y «Gamuzado» sí es gamuza. Un nombre cualquiera sigue sin dibujo.
    expect(familiaDeTejido("Entnta")).toBeNull();
    expect(familiaDeTejido("Gamuzada")).toBe("gamuza");
  });

  it("una familia nueva no le quita su dibujo a las que ya existían", () => {
    expect(familiaDeTejido("Oxford de algodón")).toBe("oxford");
    expect(familiaDeTejido("Algodón orgánico")).toBe("algodon");
    expect(familiaDeTejido("Poliéster")).toBe("poliester");
    expect(familiaDeTejido("Jersey")).toBe("jersey");
  });
});
