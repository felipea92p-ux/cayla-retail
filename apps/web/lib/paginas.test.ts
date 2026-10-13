import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Paginas } from "../components/ui/Paginas";

// <Paginas> (ADR-0358, ronda 8): la pieza de los números de página. El movimiento (la píldora que se desliza) es CSS y se mide en el
// navegador; aquí, lo que la persona y el lector de pantalla reciben antes de cualquier JavaScript.

const dibujar = (props: Parameters<typeof Paginas>[0]) => renderToStaticMarkup(createElement(Paginas, props));

describe("<Paginas>", () => {
  it("con una sola página no dibuja nada", () => {
    expect(dibujar({ pagina: 1, totalPaginas: 1, onPagina: () => {} })).toBe("");
  });

  it("marca la página actual (y la pinta ella misma hasta que se mide la píldora)", () => {
    const html = dibujar({ pagina: 3, totalPaginas: 8, onPagina: () => {} });
    expect(html).toContain('aria-label="Paginación"');
    expect(html).toMatch(/aria-current="page"[^>]*>3</);
    expect(html).not.toContain("data-pista");
  });

  it("corta con «…» y deja la primera y la última", () => {
    const html = dibujar({ pagina: 5, totalPaginas: 20, onPagina: () => {} });
    const numeros = [...html.matchAll(/class="paginas-n ">(\d+)</g)].map((m) => Number(m[1]));
    expect(numeros).toEqual([1, 4, 5, 6, 20]);
    expect(html.match(/paginas-corte/g)).toHaveLength(2);
  });

  it("en la primera página la flecha de atrás no se puede tocar; en la última, la de adelante", () => {
    const boton = (html: string, etiqueta: string) => html.match(new RegExp(`<button[^>]*aria-label="${etiqueta}"[^>]*>`))?.[0] ?? "";
    expect(boton(dibujar({ pagina: 1, totalPaginas: 4, onPagina: () => {} }), "Página anterior")).toContain("disabled");
    expect(boton(dibujar({ pagina: 1, totalPaginas: 4, onPagina: () => {} }), "Página siguiente")).not.toContain("disabled");
    expect(boton(dibujar({ pagina: 4, totalPaginas: 4, onPagina: () => {} }), "Página siguiente")).toContain("disabled");
  });

  it("por URL, desde un Server Component: cada número es un enlace a su página", () => {
    const hrefs = Array.from({ length: 6 }, (_, k) => `/productos?pagina=${k + 1}`);
    const html = dibujar({ pagina: 2, totalPaginas: 6, hrefs });
    expect(html).toContain('href="/productos?pagina=3"');
    expect(html).toMatch(/href="\/productos\?pagina=1"[^>]*aria-label="Página anterior"|aria-label="Página anterior"[^>]*href="\/productos\?pagina=1"/);
    expect(html).not.toContain("<button");
  });

  it("`grande` da los 36 px de Marcas", () => {
    expect(dibujar({ pagina: 1, totalPaginas: 3, onPagina: () => {}, grande: true })).toContain("paginas-grande");
  });
});
