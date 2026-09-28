import { describe, expect, it } from "vitest";
import { destinoQueSaleDeLaPantalla, fotoFormulario, type ClicEnEnlace } from "./salida-sin-guardar";

const AQUI = "http://localhost:3010/productos/abc/editar";
const clic = (cambio: Partial<ClicEnEnlace> = {}): ClicEnEnlace => ({
  boton: 0,
  conTecla: false,
  yaAtendido: false,
  href: "/productos",
  target: null,
  descarga: false,
  ...cambio,
});

describe("destinoQueSaleDeLaPantalla — qué clics frena el aviso", () => {
  it("un enlace del menú a otra pantalla del ERP sale", () => {
    expect(destinoQueSaleDeLaPantalla(clic(), AQUI)).toBe("/productos");
    expect(destinoQueSaleDeLaPantalla(clic({ href: "/vender?sede=lim" }), AQUI)).toBe("/vender?sede=lim");
  });
  it("abrir en otra pestaña no sale: la ficha sigue abierta", () => {
    expect(destinoQueSaleDeLaPantalla(clic({ conTecla: true }), AQUI)).toBeNull();
    expect(destinoQueSaleDeLaPantalla(clic({ boton: 1 }), AQUI)).toBeNull();
    expect(destinoQueSaleDeLaPantalla(clic({ target: "_blank" }), AQUI)).toBeNull();
  });
  it("un ancla de la misma pantalla no sale", () => {
    expect(destinoQueSaleDeLaPantalla(clic({ href: "#fotos" }), AQUI)).toBeNull();
  });
  it("otro sitio, una descarga o un clic que otro ya atendió no se frenan aquí", () => {
    expect(destinoQueSaleDeLaPantalla(clic({ href: "https://sunat.gob.pe" }), AQUI)).toBeNull();
    expect(destinoQueSaleDeLaPantalla(clic({ descarga: true }), AQUI)).toBeNull();
    expect(destinoQueSaleDeLaPantalla(clic({ yaAtendido: true }), AQUI)).toBeNull();
    expect(destinoQueSaleDeLaPantalla(clic({ href: null }), AQUI)).toBeNull();
  });
});

describe("fotoFormulario — hay cambios o no", () => {
  it("el orden de las claves no cuenta como cambio", () => {
    expect(fotoFormulario({ a: 1, b: [{ x: 1, y: 2 }] })).toBe(fotoFormulario({ b: [{ y: 2, x: 1 }], a: 1 }));
  });
  it("un precio distinto sí", () => {
    expect(fotoFormulario({ precio: "80" })).not.toBe(fotoFormulario({ precio: "81" }));
  });
});
