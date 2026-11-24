import { describe, expect, it } from "vitest";
import { EJEMPLO_NEUTRO, sugerirNombreCasilla } from "./sugerencias-casillas";
import { CASILLAS_DE_FABRICA } from "./margen-por-rasgos";

describe("sugerirNombreCasilla: el ejemplo nunca es una casilla que ya existe", () => {
  it("con las de fábrica, el primero de la tabla", () => {
    expect(sugerirNombreCasilla(CASILLAS_DE_FABRICA)).toEqual({ texto: "Ej. Hecha a mano", neutro: false });
  });
  it("salta la que ya está, sin mirar tildes ni mayúsculas", () => {
    expect(sugerirNombreCasilla([...CASILLAS_DE_FABRICA, { nombre: "HECHA A MANO" }]).texto).toBe("Ej. Edición corta");
    expect(sugerirNombreCasilla([{ nombre: "hecha a mano" }, { nombre: "Edicion corta" }]).texto).toBe("Ej. Diseño de artista");
  });
  it("si ya están todas, un texto que no promete nada", () => {
    const todas = ["Hecha a mano", "Edición corta", "Diseño de artista", "Para una ocasión"].map((nombre) => ({ nombre }));
    expect(sugerirNombreCasilla(todas)).toEqual({ texto: `Ej. ${EJEMPLO_NEUTRO}`, neutro: true });
  });
  it("es estable: lo mismo da lo mismo", () => {
    expect(sugerirNombreCasilla(CASILLAS_DE_FABRICA)).toEqual(sugerirNombreCasilla([...CASILLAS_DE_FABRICA]));
  });
});
