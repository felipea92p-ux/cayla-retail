import { describe, it, expect } from "vitest";
import { numerosDePagina, paginar } from "./paginacion";

const filas = Array.from({ length: 40 }, (_, i) => i + 1);

describe("paginar", () => {
  it("corta la primera página de 15", () => {
    const p = paginar(filas, 1, 15);
    expect(p.filas).toEqual(filas.slice(0, 15));
    expect(p).toMatchObject({ pagina: 1, totalPaginas: 3, desde: 1, hasta: 15 });
  });

  it("la última página trae solo lo que queda", () => {
    const p = paginar(filas, 3, 15);
    expect(p.filas).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
    expect(p).toMatchObject({ pagina: 3, desde: 31, hasta: 40 });
  });

  it("una página que ya no existe cae en la última, no en una tabla vacía", () => {
    expect(paginar(filas, 9, 15)).toMatchObject({ pagina: 3, desde: 31, hasta: 40 });
  });

  it("una página inválida (0, negativa, NaN) es la primera", () => {
    expect(paginar(filas, 0, 15).pagina).toBe(1);
    expect(paginar(filas, -4, 15).pagina).toBe(1);
    expect(paginar(filas, Number.NaN, 15).pagina).toBe(1);
  });

  it("sin filas: una sola página vacía, desde/hasta en 0", () => {
    expect(paginar([], 1, 15)).toEqual({ filas: [], pagina: 1, totalPaginas: 1, desde: 0, hasta: 0 });
  });

  it("justo 15 filas es una sola página", () => {
    expect(paginar(filas.slice(0, 15), 2, 15)).toMatchObject({ pagina: 1, totalPaginas: 1, hasta: 15 });
  });
});

describe("numerosDePagina", () => {
  it("corta con «…» lejos de los extremos", () => {
    expect(numerosDePagina(36, 20)).toEqual([1, null, 19, 20, 21, null, 36]);
  });

  it("pocas páginas: todas, sin cortes", () => {
    expect(numerosDePagina(3, 1)).toEqual([1, 2, 3]);
  });
});
