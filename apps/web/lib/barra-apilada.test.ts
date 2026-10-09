import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarraApilada, MuestraTramo, type SegmentoBarra } from "../components/ui/BarraApilada";

// La barra apilada del sistema (ADR-0358, 2026-10-09; docs/unificar/grafico.barra.md). Lo que la pantalla no puede ver y la persona
// sí oye: el resumen para el lector, qué tramos existen, cuándo es un botón y cuándo solo una imagen.

const TRAMOS: SegmentoBarra[] = [
  { clave: "vencida", nombre: "Vencida", valor: 5133.6, clase: "bg-rojo" },
  { clave: "0_7", nombre: "0–7 días", valor: 0, clase: "bg-ambar" },
  { clave: "8_30", nombre: "8–30 días", valor: 37453.2, clase: "bg-tinta/50" },
];
const html = (props: Partial<Parameters<typeof BarraApilada>[0]> = {}) => renderToStaticMarkup(createElement(BarraApilada, { segmentos: TRAMOS, ...props }));
const tramosDe = (h: string) => [...h.matchAll(/class="barra-tramo anim-crece-x"/g)].length;
const grows = (h: string) => [...h.matchAll(/flex-grow:([\d.]+)/g)].map((m) => Number(m[1]));

describe("BarraApilada · solo se lee", () => {
  it("es UNA imagen con su resumen (total y partes), y no dibuja un tramo en cero", () => {
    const h = html({ segmentos: [{ clave: "a", nombre: "Recién llegada", valor: 6, clase: "bg-verde" }, { clave: "b", nombre: "En su tiempo", valor: 4, clase: "bg-tinta/25" }, { clave: "c", nombre: "Hay que moverla", valor: 0, clase: "bg-tinta" }] });
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="10 unidades. Recién llegada: 6 · En su tiempo: 4"');
    expect(h).not.toContain("<button");
    expect(tramosDe(h)).toBe(2);
  });

  it("vacía: la pista sola, y el lector oye que no hay nada", () => {
    const h = html({ segmentos: [], unidad: "prendas" });
    expect(h).toContain('aria-label="0 prendas. sin prendas"');
    expect(tramosDe(h)).toBe(0);
  });

  it("un valor negativo no cuenta ni dibuja", () => {
    const h = html({ segmentos: [{ clave: "a", nombre: "A", valor: 3, clase: "bg-verde" }, { clave: "b", nombre: "B", valor: -2, clase: "bg-rojo" }] });
    expect(h).toContain('aria-label="3 unidades. A: 3"');
    expect(tramosDe(h)).toBe(1);
  });

  it("cada tramo crece por su PARTE del total (suma 100) y entra en orden (--i cuenta solo los que se dibujan)", () => {
    const h = html();
    const g = grows(h);
    expect(g).toHaveLength(2);
    expect(g.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    expect(g[0]).toBeCloseTo((5133.6 / 42586.8) * 100, 5);
    expect(h).toMatch(/--i:0/);
    expect(h).toMatch(/--i:1/);
  });

  it("si las cifras suman menos de 1, la barra igual llena la pista", () => {
    const g = grows(html({ segmentos: [{ clave: "a", nombre: "A", valor: 0.3, clase: "bg-verde" }, { clave: "b", nombre: "B", valor: 0.2, clase: "bg-tinta" }] }));
    expect(g.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it("el color va en una capa interna sobre la base de arena del tramo, y es invisible al lector", () => {
    const h = html();
    expect(h).toContain('<i aria-hidden="true" class="barra-tramo-color bg-rojo"></i>');
    expect(h).toContain('<i aria-hidden="true" class="barra-tramo-color bg-tinta/50"></i>');
  });

  it("el alto es uno de tres (12 por defecto, 8 y 4) y `className` solo ubica la barra", () => {
    expect(html()).toContain('data-alto="12"');
    expect(html({ alto: 8 })).toContain('data-alto="8"');
    expect(html({ alto: 4, className: "mt-3.5" })).toMatch(/data-alto="4" class="barra-apilada mt-3\.5"/);
    expect(html()).toContain('class="barra-apilada"');
  });
});

describe("BarraApilada · el resumen lo puede decir la pantalla", () => {
  it("`formato` dice las cifras y `etiqueta` reemplaza el resumen entero", () => {
    const soles = (n: number) => `S/ ${n.toFixed(2)}`;
    expect(html({ formato: soles, unidad: "soles" })).toContain('aria-label="S/ 42586.80 soles. Vencida: S/ 5133.60 · 8–30 días: S/ 37453.20"');
    expect(html({ etiqueta: "Deuda por vencimiento: Vencida S/ 5,133.60, 8–30 días S/ 37,453.20" })).toContain('aria-label="Deuda por vencimiento: Vencida S/ 5,133.60, 8–30 días S/ 37,453.20"');
  });
});

describe("BarraApilada · responde (los tramos son botones)", () => {
  const respuesta = { onApuntar: () => {}, onElegir: () => {}, accion: "Filtrar la lista" };

  it("el grupo lleva su resumen y cada tramo es un botón con su nombre y lo que hace", () => {
    const h = html({ respuesta, formato: (n) => `S/ ${n}` });
    expect(h).toContain('role="group"');
    expect(h).not.toContain('role="img"');
    expect(h).toContain('aria-label="Vencida: S/ 5133.6. Filtrar la lista"');
    expect(h).toContain('aria-label="8–30 días: S/ 37453.2. Filtrar la lista"');
    expect(h.match(/<button/g)).toHaveLength(2);
  });

  it("sin filtro: ningún tramo está presionado ni apagado", () => {
    const h = html({ respuesta });
    expect(h.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(h).not.toContain("data-apagado");
  });

  it("con un filtro puesto: el elegido queda presionado y los demás se apagan", () => {
    const h = html({ respuesta: { ...respuesta, elegida: "vencida" } });
    expect(h.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(h.match(/data-apagado/g)).toHaveLength(1);
    expect(h).toMatch(/aria-pressed="true"[^>]*aria-label="Vencida/);
  });

  it("sin la acción, el nombre del tramo no lleva un punto suelto", () => {
    const h = html({ respuesta: { onElegir: () => {} } });
    expect(h).toContain('aria-label="Vencida: 5133.6"');
  });
});

describe("MuestraTramo · el cuadrito de la leyenda", () => {
  it("lleva la misma capa de color sobre la misma base que el tramo, y no la oye el lector", () => {
    const h = renderToStaticMarkup(createElement(MuestraTramo, { clase: "bg-tinta/25" }));
    expect(h).toContain('class="barra-muestra"');
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain('class="barra-tramo-color bg-tinta/25"');
  });
});
