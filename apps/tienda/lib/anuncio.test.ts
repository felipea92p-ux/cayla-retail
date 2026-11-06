import { describe, expect, it } from "vitest";
import { estadoDeFrase, fraseSiguiente } from "./anuncio";

describe("la franja de anuncios", () => {
  it("los mensajes pasan de uno en uno y al final dan la vuelta", () => {
    expect(fraseSiguiente(0, 3)).toBe(1);
    expect(fraseSiguiente(1, 3)).toBe(2);
    expect(fraseSiguiente(2, 3)).toBe(0);
  });

  it("sin mensajes no se cae", () => {
    expect(fraseSiguiente(0, 0)).toBe(0);
  });

  it("al cargar se ve uno, quieto", () => {
    expect([0, 1, 2].map((i) => estadoDeFrase(i, 0, null))).toEqual(["fija", null, null]);
  });

  it("al cambiar, entra uno y sale el anterior, y los demás esperan escondidos", () => {
    expect([0, 1, 2].map((i) => estadoDeFrase(i, 2, 0))).toEqual(["sale", null, "entra"]);
  });
});
