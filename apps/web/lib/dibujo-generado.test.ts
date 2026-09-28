import { describe, it, expect } from "vitest";
import { coloresEnTexto, leerDescripcion, mezclar, svgDeReceta, urlDeSvg, variantes, type ColorDibujo, type RecetaPatron, type RecetaTejido } from "./dibujo-generado";

// Una parte del catálogo real de colores (producción, 2026-09-28): nombre, hex y sinónimos.
const CATALOGO: ColorDibujo[] = [
  { nombre: "Blanco", hex: "#F4F9FF" },
  { nombre: "Crudo", hex: "#F3ECE0", sinonimos: ["blanco roto", "hueso", "marfil", "ecru", "crema"] },
  { nombre: "Negro", hex: "#2D2C2F" },
  { nombre: "Azul marino", hex: "#2A304E", sinonimos: ["azul noche", "navy", "azul oscuro"] },
  { nombre: "Azul denim", hex: "#5979A2" },
  { nombre: "Rojo", hex: "#BD332D" },
  { nombre: "Vino", hex: "#6C2831", sinonimos: ["guinda", "burdeos"] },
  { nombre: "Verde oliva", hex: "#6A6F34", sinonimos: ["oliva"] },
  { nombre: "Topo", hex: "#82776B", sinonimos: ["taupe"] },
  { nombre: "Arena", hex: "#CCA67F", sinonimos: ["café con leche"] },
];

const nombres = (texto: string) => coloresEnTexto(texto, CATALOGO).map((c) => c.tono.nombre);

describe("coloresEnTexto — los colores del catálogo, en orden", () => {
  it("«azul marino» gana sobre «azul»", () => {
    expect(nombres("rayas azul marino")).toEqual(["Azul marino"]);
  });

  it("entiende sinónimos, sin tildes y en plural o femenino", () => {
    expect(nombres("flores guinda sobre marfil")).toEqual(["Vino", "Crudo"]);
    expect(nombres("rayas NEGRAS y blancas")).toEqual(["Negro", "Blanco"]);
    expect(nombres("fondo café con leche")).toEqual(["Arena"]);
  });

  it("una palabra de color que no está en el catálogo cae en los básicos", () => {
    expect(nombres("lunares amarillos")).toEqual(["Amarillo"]);
  });

  it("«topos» son lunares, no el color Topo", () => {
    expect(nombres("topos rojos")).toEqual(["Rojo"]);
  });

  it("no inventa colores dentro de otras palabras", () => {
    expect(nombres("estampado abstracto")).toEqual([]);
  });

  it("un hex raro de la base nunca llega al dibujo", () => {
    const [c] = coloresEnTexto("rojo", [{ nombre: "Rojo", hex: '"/><script>' }]);
    expect(c.tono.hex).toBe("#8A8A88");
  });
});

describe("leerDescripcion — patrón", () => {
  it("rayas azul marino finas sobre crudo", () => {
    const l = leerDescripcion("patron", "Rayas", "rayas azul marino finas sobre crudo", CATALOGO);
    const r = l.receta as RecetaPatron;
    expect(r.familia).toBe("rayas");
    expect(r.tinta.hex).toBe("#2A304E");
    expect(r.fondo.hex).toBe("#F3ECE0");
    expect(r.escala).toBeLessThan(1);
    expect(l.entendido).toBe("Rayas · Azul marino sobre Crudo · finas");
    expect(l.reconocido).toBe(true);
  });

  it("un tercer color es el acento, y lo dice", () => {
    const l = leerDescripcion("patron", "Floral", "flores rojas con hojas verde oliva sobre crudo", CATALOGO);
    expect((l.receta as RecetaPatron).acento.nombre).toBe("Verde oliva");
    expect(l.entendido).toBe("Floral · Rojo sobre Crudo con Verde oliva");
  });

  it("el color marcado con «fondo» es el fondo aunque vaya primero", () => {
    const r = leerDescripcion("patron", "Floral", "fondo negro con flores rojas", CATALOGO).receta as RecetaPatron;
    expect(r.fondo.nombre).toBe("Negro");
    expect(r.tinta.nombre).toBe("Rojo");
  });

  it("sin frase, la familia sale del nombre y los colores son los de siempre", () => {
    const l = leerDescripcion("patron", "Lunares", "", CATALOGO);
    expect((l.receta as RecetaPatron).familia).toBe("lunares");
    expect(l.reconocido).toBe(true);
  });

  it("un dibujo que no conoce cae en «Estampado» y lo dice", () => {
    const l = leerDescripcion("patron", "Paisley", "gotas curvas", CATALOGO);
    expect((l.receta as RecetaPatron).familia).toBe("estampado");
    expect(l.reconocido).toBe(false);
  });

  it("liso: el color nombrado es la tela entera", () => {
    const r = leerDescripcion("patron", "Liso", "verde oliva", CATALOGO).receta as RecetaPatron;
    expect(r.tinta.hex).toBe(r.fondo.hex);
    expect(r.tinta.nombre).toBe("Verde oliva");
  });

  it("dos veces el mismo color no deja un dibujo invisible", () => {
    const r = leerDescripcion("patron", "Rayas", "rayas crudo sobre crudo", CATALOGO).receta as RecetaPatron;
    expect(r.tinta.hex).not.toBe(r.fondo.hex);
  });

  it("lee la orientación de las rayas", () => {
    expect((leerDescripcion("patron", "Rayas", "rayas horizontales", CATALOGO).receta as RecetaPatron).orientacion).toBe("horizontal");
    expect((leerDescripcion("patron", "Rayas", "rayas en diagonal", CATALOGO).receta as RecetaPatron).orientacion).toBe("diagonal");
  });
});

describe("leerDescripcion — tejido", () => {
  it("denim sin color: sarga índigo", () => {
    const l = leerDescripcion("tejido", "Denim", "", CATALOGO);
    const r = l.receta as RecetaTejido;
    expect(r.textura).toBe("sarga");
    expect(l.entendido).toMatch(/^Sarga · /);
  });

  it("el color de la frase manda sobre el de la tela", () => {
    const r = leerDescripcion("tejido", "Lino", "lino color arena", CATALOGO).receta as RecetaTejido;
    expect(r.textura).toBe("lino");
    expect(r.base.nombre).toBe("Arena");
  });

  it("una palabra de textura alcanza aunque el nombre no se reconozca", () => {
    const l = leerDescripcion("tejido", "Tela nueva", "de punto, gris", CATALOGO);
    expect((l.receta as RecetaTejido).textura).toBe("punto");
    expect(l.reconocido).toBe(true);
  });
});

describe("variantes", () => {
  it("tres escalas distintas, y si la frase fijó el fondo nunca lo invierte", () => {
    const l = leerDescripcion("patron", "Rayas", "rayas rojas sobre crudo", CATALOGO);
    const ronda1 = variantes(l, 1) as RecetaPatron[];
    expect(new Set(ronda1.map((r) => r.escala)).size).toBe(3);
    expect(ronda1.every((r) => r.fondo.nombre === "Crudo")).toBe(true);
  });

  it("sin fondo marcado, «otra variante» prueba invertir dibujo y fondo", () => {
    const l = leerDescripcion("patron", "Lunares", "lunares negros y blancos", CATALOGO);
    const [a] = variantes(l, 0) as RecetaPatron[];
    const [b] = variantes(l, 1) as RecetaPatron[];
    expect(a.tinta.nombre).toBe(b.fondo.nombre);
  });
});

describe("svgDeReceta", () => {
  it("es determinista y usa los colores de la receta", () => {
    const l = leerDescripcion("patron", "Floral", "flores rojas sobre crudo", CATALOGO);
    const [r] = variantes(l, 0);
    expect(svgDeReceta(r)).toBe(svgDeReceta(r));
    expect(svgDeReceta(r)).toContain("#BD332D");
    expect(svgDeReceta(r)).toContain("#F3ECE0");
  });

  it("dibuja todas las familias y texturas sin texto raro", () => {
    for (const nombre of ["Liso", "Rayas", "Cuadros", "Lunares", "Floral", "Animal print", "Estampado"]) {
      const svg = svgDeReceta(variantes(leerDescripcion("patron", nombre, "", CATALOGO), 0)[1]);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|<script/);
    }
    for (const nombre of ["Algodón", "Lino", "Denim", "Jersey", "Rib", "Piqué", "Polar", "Seda"]) {
      const svg = svgDeReceta(variantes(leerDescripcion("tejido", nombre, "", CATALOGO), 0)[1]);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("urlDeSvg lo codifica para una <img>", () => {
    expect(urlDeSvg("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });
});

describe("mezclar", () => {
  it("mitad de negro y blanco es gris", () => {
    expect(mezclar("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});
