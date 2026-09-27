import { describe, it, expect } from "vitest";
import { numerosDePagina, paginar, paginarSinPartirGrupos } from "./paginacion";

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

describe("paginarSinPartirGrupos (una percha no se parte entre páginas)", () => {
  // Cada fila es "grupo/n": el grupo es lo que va antes de la barra.
  const deGrupos = (...tamanos: number[]) => tamanos.flatMap((t, g) => Array.from({ length: t }, (_, i) => `${String.fromCharCode(97 + g)}/${i + 1}`));
  const grupo = (f: string) => f.split("/")[0];

  it("si ningún grupo cruza el corte, pagina igual que `paginar`", () => {
    const f = deGrupos(5, 5, 5, 5); // cortes limpios en 15
    const [a, b] = [paginarSinPartirGrupos(f, 1, 15, grupo), paginar(f, 1, 15)];
    expect(a).toEqual(b);
    expect(paginarSinPartirGrupos(f, 2, 15, grupo)).toEqual(paginar(f, 2, 15));
  });

  it("el grupo que cruza el corte termina en la misma página (la S, la M y la L de una casaca, juntas)", () => {
    const f = deGrupos(13, 3, 4); // el grupo «b» ocupa las filas 14, 15 y 16
    const p1 = paginarSinPartirGrupos(f, 1, 15, grupo);
    expect(p1.filas.slice(-3)).toEqual(["b/1", "b/2", "b/3"]);
    expect(p1).toMatchObject({ pagina: 1, totalPaginas: 2, desde: 1, hasta: 16 });
    const p2 = paginarSinPartirGrupos(f, 2, 15, grupo);
    expect(p2.filas).toEqual(["c/1", "c/2", "c/3", "c/4"]);
    expect(p2).toMatchObject({ pagina: 2, desde: 17, hasta: 20 });
  });

  it("toda fila sale en exactamente una página, en su orden", () => {
    const f = deGrupos(4, 7, 2, 9, 1, 6, 3, 5);
    const p1 = paginarSinPartirGrupos(f, 1, 15, grupo);
    const todas = Array.from({ length: p1.totalPaginas }, (_, i) => paginarSinPartirGrupos(f, i + 1, 15, grupo).filas).flat();
    expect(todas).toEqual(f);
  });

  it("un grupo más largo que la página entra entero en una sola", () => {
    const f = deGrupos(2, 20);
    expect(paginarSinPartirGrupos(f, 1, 15, grupo)).toMatchObject({ totalPaginas: 1, desde: 1, hasta: 22 });
  });

  it("una página que ya no existe cae en la última; una inválida es la primera", () => {
    const f = deGrupos(13, 3, 4);
    expect(paginarSinPartirGrupos(f, 9, 15, grupo)).toMatchObject({ pagina: 2, desde: 17 });
    expect(paginarSinPartirGrupos(f, Number.NaN, 15, grupo).pagina).toBe(1);
  });

  it("sin filas: una sola página vacía", () => {
    expect(paginarSinPartirGrupos([], 1, 15, grupo)).toEqual({ filas: [], pagina: 1, totalPaginas: 1, desde: 0, hasta: 0 });
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
