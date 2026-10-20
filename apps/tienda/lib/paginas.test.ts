import { describe, expect, it } from "vitest";
import { conPagina, leerPagina, numerosDePaginas, paginaDe, POR_PAGINA, POR_PAGINA_PROBADOR } from "./paginas";

describe("qué página pide la dirección", () => {
  it("sin `pagina`, con algo raro o menor que 1: la primera", () => {
    expect(leerPagina(undefined)).toBe(1);
    expect(leerPagina("")).toBe(1);
    expect(leerPagina("muchas")).toBe(1);
    expect(leerPagina("0")).toBe(1);
    expect(leerPagina("-4")).toBe(1);
  });

  it("lo pedido, con un tope para una dirección escrita a mano", () => {
    expect(leerPagina("3")).toBe(3);
    expect(leerPagina(["2", "9"])).toBe(2);
    expect(leerPagina("999999")).toBe(500);
  });
});

describe("cuántas tarjetas lleva cada página", () => {
  it("30 en el catálogo y 8 en el probador (dos filas de cuatro)", () => {
    expect(POR_PAGINA).toBe(30);
    expect(POR_PAGINA_PROBADOR).toBe(8);
    expect(POR_PAGINA_PROBADOR % 4).toBe(0);
    // 30 llena filas completas en las 2 y 3 columnas de la grilla del catálogo (celular y computadora).
    for (const columnas of [2, 3]) expect(POR_PAGINA % columnas).toBe(0);
  });
});

describe("la página de una lista", () => {
  it("las 298 prendas de producción son 10 páginas: nueve de 30 y la última de 28", () => {
    const ultima = paginaDe(298, 10, POR_PAGINA);
    expect(ultima).toEqual({ pagina: 10, paginas: 10, desde: 270, hasta: 298 });
    expect(paginaDe(298, 1, POR_PAGINA)).toEqual({ pagina: 1, paginas: 10, desde: 0, hasta: 30 });
  });

  it("30 justas son una sola página; 31, dos", () => {
    expect(paginaDe(30, 1, POR_PAGINA).paginas).toBe(1);
    expect(paginaDe(31, 1, POR_PAGINA).paginas).toBe(2);
    expect(paginaDe(31, 2, POR_PAGINA)).toMatchObject({ desde: 30, hasta: 31 });
  });

  it("una lista vacía tiene una página vacía (nunca 0 páginas)", () => {
    expect(paginaDe(0, 1, POR_PAGINA)).toEqual({ pagina: 1, paginas: 1, desde: 0, hasta: 0 });
  });

  it("una página que ya no existe cae en la última, nunca en una lista en blanco", () => {
    expect(paginaDe(45, 9, POR_PAGINA)).toMatchObject({ pagina: 2, desde: 30, hasta: 45 });
  });

  it("en el probador: 8 por página", () => {
    expect(paginaDe(19, 3, POR_PAGINA_PROBADOR)).toEqual({ pagina: 3, paginas: 3, desde: 16, hasta: 19 });
  });
});

describe("la dirección de cada página", () => {
  it("la primera vuelve a la dirección de siempre y lo demás se queda", () => {
    expect(conPagina("/catalogo?orden=precio&pagina=3", 1)).toBe("/catalogo?orden=precio");
    expect(conPagina("/catalogo", 1)).toBe("/catalogo");
    expect(conPagina("/catalogo?menu=ropa", 2)).toBe("/catalogo?menu=ropa&pagina=2");
    expect(conPagina("/catalogo?pagina=2&menu=ropa", 5)).toBe("/catalogo?pagina=5&menu=ropa");
  });
});

describe("los números de la barra", () => {
  it("hasta 7 páginas salen todas", () => {
    expect(numerosDePaginas(1, 1)).toEqual([1]);
    expect(numerosDePaginas(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("con más: primera, última y las vecinas de la actual, con «…» donde se salta", () => {
    expect(numerosDePaginas(1, 10)).toEqual([1, 2, 3, 4, "…", 10]);
    expect(numerosDePaginas(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(numerosDePaginas(10, 10)).toEqual([1, "…", 7, 8, 9, 10]);
  });

  it("nunca un «…» esconde una sola página: se dibuja el número", () => {
    expect(numerosDePaginas(4, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
    expect(numerosDePaginas(7, 10)).toEqual([1, "…", 6, 7, 8, 9, 10]);
  });

  it("siempre trae la actual, la primera y la última, sin repetir ni desordenar", () => {
    for (let total = 1; total <= 30; total++) {
      for (let actual = 1; actual <= total; actual++) {
        const n = numerosDePaginas(actual, total);
        const numeros = n.filter((x): x is number => x !== "…");
        expect(numeros).toContain(actual);
        expect(numeros[0]).toBe(1);
        expect(numeros[numeros.length - 1]).toBe(total);
        expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
        expect(new Set(numeros).size).toBe(numeros.length);
      }
    }
  });
});
