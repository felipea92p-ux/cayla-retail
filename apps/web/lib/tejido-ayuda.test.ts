import { describe, it, expect } from "vitest";
import { ayudaDeTejido } from "./tejido-ayuda";
import { familiaDeTejido } from "./tejido-visual";

// El vocabulario de tejidos aprobados y activos de producción al 2026-10-02 (consulta de solo lectura). Cada uno tiene que
// dibujarse Y describirse: si uno cae en `null`, la tarjeta de Nuevo producto queda muda justo donde la persona decide.
// (`pruebaTEJIDO` es un dato de prueba desactivado: no cuenta.)
const TEJIDOS_DE_PRODUCCION = [
  "Algodón",
  "Algodón alicrado",
  "Algodón pima",
  "Alpaca",
  "Aterciopelada",
  "Denim",
  "Drill",
  "franela",
  "Gabardina",
  "Gasa",
  "Hilo",
  "Hilo de algodón",
  "Jersey",
  "lana",
  "Licra",
  "Lino",
  "Macramé",
  "Mix Algodón & Poliéster",
  "Oxford",
  "Pana",
  "Piqué",
  "Polar",
  "Poliéster",
  "Popelina",
  "Rayón",
  "Rib",
  "Sastre",
  "Satín",
  "Seda",
  "Seersucker",
  "Suplex",
  "Tela",
  "Tela mojada",
  "Viscosa",
];

describe("ayudaDeTejido — cubre todo el vocabulario real", () => {
  it.each(TEJIDOS_DE_PRODUCCION)("%s se dibuja y se describe", (nombre) => {
    expect(familiaDeTejido(nombre)).not.toBeNull();
    expect(ayudaDeTejido(nombre)).not.toBeNull();
  });

  it("cada ayuda dice qué es, para qué sirve y cómo se cuida, y cabe en la burbuja", () => {
    for (const nombre of TEJIDOS_DE_PRODUCCION) {
      const ayuda = ayudaDeTejido(nombre)!;
      expect(ayuda.queEs.trim().length, nombre).toBeGreaterThan(20);
      // La burbuja mide 16 rem: más de ~170 caracteres por frase es un párrafo, no una ayuda.
      expect(ayuda.queEs.length, nombre).toBeLessThanOrEqual(175);
      expect(ayuda.datos.at(-1), nombre).toMatch(/^Cuidado: .{10,}/);
      expect(ayuda.datos[0], nombre).toMatch(/^(Ideal para|Ojo): .{10,}/);
      for (const dato of ayuda.datos) expect(dato.length, nombre).toBeLessThanOrEqual(150);
    }
  });
});

describe("ayudaDeTejido — un nombre que contiene otra tela no se describe como esa tela", () => {
  it("Algodón alicrado no es Algodón: lleva elástico, y se cuida distinto", () => {
    const liso = ayudaDeTejido("Algodón")!;
    const alicrado = ayudaDeTejido("Algodón alicrado")!;
    expect(alicrado).not.toBe(liso);
    expect(alicrado.queEs).toMatch(/licra/i);
    expect(alicrado.datos.join(" ")).toMatch(/secadora/);
  });

  it("«algodón con licra» y «elastizado» caen en lo mismo que «alicrado»", () => {
    expect(ayudaDeTejido("Algodón con licra")).toBe(ayudaDeTejido("Algodón alicrado"));
    expect(ayudaDeTejido("Algodón elastizado")).toBe(ayudaDeTejido("Algodón alicrado"));
  });

  it("Mix Algodón & Poliéster es una mezcla, no poliéster solo", () => {
    expect(ayudaDeTejido("Mix Algodón & Poliéster")!.queEs).toMatch(/algodón y poliéster/i);
    expect(ayudaDeTejido("Mix Algodón & Poliéster")).not.toBe(ayudaDeTejido("Poliéster"));
  });

  it("lana no es alpaca, y cachemira tampoco", () => {
    expect(ayudaDeTejido("lana")!.queEs).toMatch(/oveja/i);
    expect(ayudaDeTejido("lana")).not.toBe(ayudaDeTejido("Alpaca"));
    expect(ayudaDeTejido("Cachemira")).not.toBe(ayudaDeTejido("Alpaca"));
  });

  it("Satín no es Seda: el satín es un tejido y casi siempre poliéster", () => {
    expect(ayudaDeTejido("Satín")).not.toBe(ayudaDeTejido("Seda"));
    expect(ayudaDeTejido("Satín")!.queEs).toMatch(/poliéster/i);
    expect(ayudaDeTejido("Seda")!.queEs).toMatch(/natural/i);
  });

  it("Rib licrado sigue siendo un canalé", () => {
    expect(ayudaDeTejido("Rib licrado")).toBe(ayudaDeTejido("Rib"));
  });

  it("Rayón y Viscosa son la misma fibra", () => {
    expect(ayudaDeTejido("Rayón")).toBe(ayudaDeTejido("Viscosa"));
  });
});

describe("ayudaDeTejido — lo que no se reconoce se calla", () => {
  it("un nombre desconocido o vacío devuelve null (la tarjeta queda sin burbuja, igual que sin dibujo)", () => {
    expect(ayudaDeTejido("Tul")).toBeNull();
    expect(ayudaDeTejido("pruebaTEJIDO")).toBeNull();
    expect(ayudaDeTejido("")).toBeNull();
  });

  it("«Tela» genérica avisa que no dice la fibra, en vez de inventar una", () => {
    const ayuda = ayudaDeTejido("Tela")!;
    expect(ayuda.queEs).toMatch(/genérico/i);
    expect(ayuda.datos[0]).toMatch(/^Ojo:/);
  });

  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(ayudaDeTejido("  SEDA ")).toBe(ayudaDeTejido("Seda"));
    expect(ayudaDeTejido("macrame")).toBe(ayudaDeTejido("Macramé"));
  });
});
