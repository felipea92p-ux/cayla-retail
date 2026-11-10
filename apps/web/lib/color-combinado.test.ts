import { describe, expect, it } from "vitest";
import { esCombinado, fondoDeMezcla, normalizarComponentes, tonosDeMezcla } from "./color-combinado";

describe("normalizarComponentes", () => {
  it("acepta la base y de 1 a 3 acompañantes, en mayúsculas y en el orden recibido", () => {
    expect(normalizarComponentes(["cru", " AZU "])).toEqual(["CRU", "AZU"]);
    expect(normalizarComponentes(["CRU", "NEG", "AZU", "ROJ"])).toEqual(["CRU", "NEG", "AZU", "ROJ"]);
  });

  it("rechaza un solo color, cinco, uno repetido, un código mal escrito o algo que no es lista", () => {
    expect(normalizarComponentes(["CRU"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZU", "NEG", "ROJ", "AZM"])).toBeNull();
    expect(normalizarComponentes(["CRU", "cru"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZUL"])).toBeNull();
    expect(normalizarComponentes(["CRU", 3])).toBeNull();
    expect(normalizarComponentes("CRU,AZU")).toBeNull();
    expect(normalizarComponentes(undefined)).toBeNull();
  });
});

describe("el punto partido", () => {
  const porCodigo = new Map([
    ["CRU", { hex: "#F3ECE0" }],
    ["AZU", { hex: "#4D91C6" }],
    ["NEG", { hex: "#2D2C2F" }],
    ["SIN", { hex: null }],
  ]);

  it("un color de un tono no es mezcla ni tiene tonos", () => {
    expect(esCombinado({ componentes: null })).toBe(false);
    expect(esCombinado({})).toBe(false);
    expect(tonosDeMezcla({ componentes: null }, porCodigo)).toBeNull();
  });

  it("una mezcla toma los tonos de sus componentes, la base primero", () => {
    expect(esCombinado({ componentes: ["CRU", "AZU"] })).toBe(true);
    expect(tonosDeMezcla({ componentes: ["CRU", "AZU", "NEG"] }, porCodigo)).toEqual(["#F3ECE0", "#4D91C6", "#2D2C2F"]);
  });

  it("si la pantalla no tiene dos tonos, se dibuja lisa", () => {
    expect(tonosDeMezcla({ componentes: ["CRU", "ZZZ"] }, porCodigo)).toBeNull();
    expect(tonosDeMezcla({ componentes: ["CRU", "SIN"] }, porCodigo)).toBeNull();
  });

  it("la base ocupa la mitad y los acompañantes se reparten la otra", () => {
    expect(fondoDeMezcla(["#111111", "#222222"])).toBe("conic-gradient(from 180deg, #111111 0% 50%, #222222 50% 100%)");
    expect(fondoDeMezcla(["#111111", "#222222", "#333333"])).toBe("conic-gradient(from 180deg, #111111 0% 50%, #222222 50% 75%, #333333 75% 100%)");
  });
});
