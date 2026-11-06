import { describe, expect, it } from "vitest";
import { estadoDeFrase, fraseVecina } from "./anuncio";

describe("la franja de anuncios", () => {
  it("las flechas pasan de un mensaje a otro y dan la vuelta en los dos sentidos", () => {
    expect(fraseVecina(0, 1, 3)).toBe(1);
    expect(fraseVecina(2, 1, 3)).toBe(0);
    expect(fraseVecina(0, -1, 3)).toBe(2);
    expect(fraseVecina(1, -1, 3)).toBe(0);
  });

  it("sin mensajes no se cae", () => {
    expect(fraseVecina(0, 1, 0)).toBe(0);
  });

  it("al cargar se ve uno, quieto", () => {
    expect([0, 1, 2].map((i) => estadoDeFrase(i, 0, null))).toEqual(["fija", null, null]);
  });

  it("al cambiar, entra uno y sale el anterior, y los demás esperan escondidos", () => {
    expect([0, 1, 2].map((i) => estadoDeFrase(i, 2, 0))).toEqual(["sale", null, "entra"]);
  });
});
