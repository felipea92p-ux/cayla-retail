import { describe, expect, it } from "vitest";
import { COLIBRI, LOGO, PALABRA, partirPorLaMarca } from "@cayla-retail/shared/marca";

describe("el logo oficial", () => {
  it("el logo completo es el colibrí más la palabra, sin repetir el dibujo", () => {
    expect(LOGO.trazo).toBe(COLIBRI.trazo + PALABRA.trazo);
  });

  it("cada pieza declara un viewBox que coincide con su ancho y su alto", () => {
    for (const pieza of [LOGO, COLIBRI, PALABRA]) {
      const [, , ancho, alto] = pieza.viewBox.split(" ").map(Number);
      expect([ancho, alto]).toEqual([pieza.ancho, pieza.alto]);
    }
  });
});

describe("partirPorLaMarca", () => {
  it("separa la palabra CAYLA del resto del título", () => {
    expect(partirPorLaMarca("Aniversario CAYLA")).toEqual(["Aniversario ", "CAYLA", ""]);
    expect(partirPorLaMarca("de CAYLA")).toEqual(["de ", "CAYLA", ""]);
    expect(partirPorLaMarca("CAYLA")).toEqual(["", "CAYLA", ""]);
  });

  it("la reconoce aunque venga en minúsculas, y más de una vez", () => {
    expect(partirPorLaMarca("Cayla de verano, CAYLA de siempre")).toEqual(["", "Cayla", " de verano, ", "CAYLA", " de siempre"]);
  });

  it("no toca una palabra que solo la contiene ni un título sin ella", () => {
    expect(partirPorLaMarca("Las CAYLAS")).toEqual(["Las CAYLAS"]);
    expect(partirPorLaMarca("Mamá Caylita")).toEqual(["Mamá Caylita"]);
    expect(partirPorLaMarca("Día de la Madre")).toEqual(["Día de la Madre"]);
  });
});
