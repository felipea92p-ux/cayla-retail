import { describe, expect, it } from "vitest";
import { estadoDeFrase } from "./anuncio";

const estados = (vuelta: number, cantidad: number) => Array.from({ length: cantidad }, (_, i) => estadoDeFrase(i, vuelta, cantidad));

describe("la franja de anuncios", () => {
  it("al cargar se ve la primera, quieta (sin animación de entrada)", () => {
    expect(estados(0, 3)).toEqual(["fija", null, null]);
  });

  it("en cada vuelta entra la siguiente y sale la anterior; las demás esperan escondidas", () => {
    expect(estados(1, 3)).toEqual(["sale", "entra", null]);
    expect(estados(2, 3)).toEqual([null, "sale", "entra"]);
    // Da la vuelta: después de la última vuelve la primera, y la última se va.
    expect(estados(3, 3)).toEqual(["entra", null, "sale"]);
    expect(estados(4, 3)).toEqual(["sale", "entra", null]);
  });

  it("siempre hay una sola a la vista (la que entra o la fija) y, como mucho, una saliendo", () => {
    for (const cantidad of [1, 2, 3, 4]) {
      for (let vuelta = 0; vuelta < 12; vuelta++) {
        const e = estados(vuelta, cantidad);
        expect(e.filter((x) => x === "fija" || x === "entra")).toHaveLength(1);
        expect(e.filter((x) => x === "sale").length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("con dos frases, la que sale es la que vuelve a entrar en la vuelta siguiente", () => {
    expect(estados(1, 2)).toEqual(["sale", "entra"]);
    expect(estados(2, 2)).toEqual(["entra", "sale"]);
  });

  it("con una sola frase no sale ninguna; sin frases (la franja de una página que carga), nada", () => {
    expect(estados(0, 1)).toEqual(["fija"]);
    expect(estados(0, 0)).toEqual([]);
    expect(estadoDeFrase(0, 0, 0)).toBeNull();
    expect(estadoDeFrase(5, 0, 3)).toBeNull();
  });

  it("al pasar a otra página sigue en la frase que se veía, quieta, y la siguiente entra a su hora", () => {
    const desde = (vuelta: number) => Array.from({ length: 3 }, (_, i) => estadoDeFrase(i, vuelta, 3, 4));
    // Se veía la segunda (vuelta 4 de 3 frases): aparece fija, sin volver a la primera ni entrar con animación.
    expect(desde(4)).toEqual([null, "fija", null]);
    // En la vuelta siguiente, como siempre: sale la que estaba y entra la que sigue.
    expect(desde(5)).toEqual([null, "sale", "entra"]);
  });
});
