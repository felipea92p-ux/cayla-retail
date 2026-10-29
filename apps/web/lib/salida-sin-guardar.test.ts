import { describe, expect, it } from "vitest";
import { antesDeRehacerLaPantalla, destinoQueSaleDeLaPantalla, fotoFormulario, registrarGuardia, type ClicEnEnlace } from "./salida-sin-guardar";

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

// /chaos 2026-10-28 (semilla 2810, NAV-09): cambiar de sede rehace la pantalla sin navegar, y Nuevo producto perdía el alta a medias
// sin preguntar. El selector de sede pregunta a las guardias vivas antes de cambiar.
describe("antesDeRehacerLaPantalla — el selector de sede pregunta si hay algo sin guardar", () => {
  it("sin guardias, o con guardias sin cambios, cambia de una", () => {
    let hecho = 0;
    antesDeRehacerLaPantalla(() => hecho++);
    const fuera = registrarGuardia({ debePreguntar: () => false, pedirAccion: () => {} });
    antesDeRehacerLaPantalla(() => hecho++);
    fuera();
    expect(hecho).toBe(2);
  });
  it("con una guardia con cambios, se le pide a ella (que pregunta) y no se cambia todavía", () => {
    let pedido: (() => void) | null = null;
    let hecho = 0;
    const fuera = registrarGuardia({ debePreguntar: () => true, pedirAccion: (fn) => (pedido = fn) });
    antesDeRehacerLaPantalla(() => hecho++);
    expect(hecho).toBe(0);
    expect(pedido).not.toBeNull();
    pedido!();
    expect(hecho).toBe(1);
    fuera();
    antesDeRehacerLaPantalla(() => hecho++);
    expect(hecho).toBe(2);
  });
});
