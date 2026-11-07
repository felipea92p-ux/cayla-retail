import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TituloConLetras } from "../components/TituloConLetras";

// Dentro de un `inline-block` el espacio final desaparece: el título «Toda la tienda» se leía «TODALATIENDA» (2026-10-27). El espacio tiene que estar ENTRE las
// palabras, fuera de ellas, y el lector tiene que oír el título entero.

describe("el título por letras", () => {
  it("deja un espacio entre palabras, fuera de la palabra", () => {
    const html = renderToStaticMarkup(createElement(TituloConLetras, { primera: "Toda la", cursiva: "tienda" }));
    // Tras cerrar una palabra viene el espacio y luego la siguiente; ninguna palabra lo lleva adentro.
    expect(html).toContain('</span> <span class="t-palabra"');
    expect(html).not.toMatch(/<\/span> <\/span>/);
    expect(html.match(/class="t-palabra"/g)).toHaveLength(3);
  });

  it("el lector oye el título entero y las letras sueltas van ocultas", () => {
    const html = renderToStaticMarkup(createElement(TituloConLetras, { cursiva: "Ropa" }));
    expect(html).toContain('aria-label="Ropa"');
    expect(html).toContain('aria-hidden="true"');
  });
});
