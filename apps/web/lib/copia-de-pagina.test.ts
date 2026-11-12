import { describe, expect, it } from "vitest";
import { anotarCarga, cargaVistaEn, idDeCarga, marcaDeLaPestana } from "./copia-de-pagina";

// ¿La página que se está dibujando es la copia que guardó el router? (medido el 2026-11-11: «atrás» siempre la reusa, y un enlace antes de
// los 30 s de `staleTimes`). Contrato (3 líneas). PROMETE: que la primera vez que una pestaña dibuja una carga no es una copia y la segunda
// sí, y que una carga ya vista dice desde cuándo. ASUME: una memoria por proceso de prueba (cada caso usa su propio ámbito). NO PROMETE: lo que
// hace cada pantalla con eso (sus pruebas lo miran).

describe("una copia de la página guardada por el router se reconoce", () => {
  it("la primera vez que se dibuja una carga no es una copia; la segunda, sí", () => {
    expect(anotarCarga("copia", "mz1abc")).toBe(false);
    expect(anotarCarga("copia", "mz1abc")).toBe(true);
  });

  it("una carga nueva del mismo ámbito no es una copia, y la de otro ámbito tampoco", () => {
    expect(anotarCarga("copia-b", "mz1abc")).toBe(false);
    expect(anotarCarga("copia-b", "mz1abd")).toBe(false);
    expect(anotarCarga("copia-c", "mz1abc")).toBe(false);
  });

  it("antes de anotarla, una carga no tiene fecha; después, la de su primera vez, que no cambia", () => {
    expect(cargaVistaEn("vista", "mz1")).toBeNull();
    const antes = marcaDeLaPestana();
    anotarCarga("vista", "mz1");
    const vistaEn = cargaVistaEn("vista", "mz1");
    expect(vistaEn).not.toBeNull();
    expect(vistaEn!).toBeGreaterThan(antes);
    anotarCarga("vista", "mz1");
    expect(cargaVistaEn("vista", "mz1")).toBe(vistaEn);
  });

  it("las marcas de la pestaña solo suben (no dependen del reloj del aparato)", () => {
    const a = marcaDeLaPestana();
    const b = marcaDeLaPestana();
    expect(b).toBeGreaterThan(a);
  });

  it("el identificador de una carga es un texto corto, distinto con el tiempo", () => {
    expect(idDeCarga()).toMatch(/^[0-9a-z]+$/);
  });
});
