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

  it("sin filtro puesto: ningún tramo está presionado ni apagado", () => {
    const h = html({ respuesta: { ...respuesta, elegida: null } });
    expect(h.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(h).not.toContain("data-apagado");
  });

  it("con un filtro puesto: el elegido queda presionado y los demás se apagan", () => {
    const h = html({ respuesta: { ...respuesta, elegida: "vencida" } });
    expect(h.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(h.match(/data-apagado/g)).toHaveLength(1);
    expect(h).toMatch(/aria-pressed="true"[^>]*aria-label="Vencida/);
  });

  it("sin `elegida` (la pantalla no maneja un filtro) los tramos no son interruptores: no llevan aria-pressed", () => {
    const h = html({ respuesta });
    expect(h).not.toContain("aria-pressed");
    expect(h.match(/<button/g)).toHaveLength(2);
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

describe("BarraApilada · lo que piden las barras de Compras", () => {
  const dos: SegmentoBarra[] = [
    { clave: "p1", nombre: "Textiles Sur", valor: 62, clase: "bg-tinta" },
    { clave: "p2", nombre: "Hilos Lima", valor: 21, clase: "bg-tinta/45" },
    { clave: "otros", nombre: "Otros", valor: 17, clase: "bg-tinta/25", inerte: true, titulo: "Otros · 17 %", etiqueta: "Otros · 17 %" },
  ];

  it("un tramo con `href` es un enlace, con su etiqueta propia y su título; el `inerte` no responde", () => {
    const h = html({
      segmentos: dos.map((s) => (s.inerte ? s : { ...s, href: `/compras/por-pagar?prov=${s.clave}`, etiqueta: `${s.nombre} · 62 %. Filtrar la lista por este proveedor`, titulo: `${s.nombre} · 62 %` })),
      respuesta: { onApuntar: () => {}, resaltada: null },
    });
    expect(h.match(/<a /g)).toHaveLength(2);
    expect(h).toContain('href="/compras/por-pagar?prov=p1"');
    expect(h).toContain('aria-label="Textiles Sur · 62 %. Filtrar la lista por este proveedor"');
    expect(h).toContain('title="Textiles Sur · 62 %"');
    expect(h).not.toContain("<button");
    // el inerte es un span con su título y su etiqueta, y no lleva aria-pressed
    expect(h).toMatch(/<span title="Otros · 17 %" aria-label="Otros · 17 %"[^>]*class="barra-tramo anim-crece-x"/);
    expect(h).not.toContain("aria-pressed");
  });

  it("`resaltada` apaga a los demás (el inerte también) sin dejar a ninguno «presionado»", () => {
    const h = html({ segmentos: dos, respuesta: { onApuntar: () => {}, onElegir: () => {}, resaltada: "p1" } });
    expect(h.match(/data-apagado/g)).toHaveLength(2); // p2 y el inerte
    expect(h).not.toContain('aria-pressed="true"');
    expect(html({ segmentos: dos, respuesta: { onApuntar: () => {}, resaltada: null } })).not.toContain("data-apagado");
  });

  it("`oculto` no lo oye el lector y `etiqueta` de un botón reemplaza la automática", () => {
    const h = html({
      segmentos: [{ clave: "a", nombre: "A", valor: 1, clase: "bg-tinta", etiqueta: "A: S/ 1, 50 % de la deuda" }, { clave: "resto", nombre: "Resto", valor: 1, clase: "bg-sand", inerte: true, oculto: true }],
      respuesta: { onApuntar: () => {} },
    });
    expect(h).toContain('aria-label="A: S/ 1, 50 % de la deuda"');
    expect(h).toMatch(/<span aria-hidden="true"[^>]*class="barra-tramo anim-crece-x"/);
  });

  it("`decorativa`: el lector no la oye (sin rol ni resumen)", () => {
    const h = html({ decorativa: true });
    expect(h).toContain('aria-hidden="true"');
    expect(h).not.toContain("role=");
    expect(h).not.toContain("aria-label=\"");
  });

  it("`retraso` corre la entrada de todos los tramos (--i)", () => {
    const h = html({ retraso: 6 });
    expect(h).toMatch(/--i:6/);
    expect(h).toMatch(/--i:7/);
  });

  it("`total`: si la pista vale más que los tramos, lo que falta es un hueco; si no, no hay hueco", () => {
    const parcial = html({ segmentos: [{ clave: "a", nombre: "A", valor: 30, clase: "bg-tinta" }, { clave: "b", nombre: "B", valor: 20, clase: "bg-verde" }], total: 100 });
    const g = grows(parcial);
    expect(g[0]).toBeCloseTo(30, 5);
    expect(g[1]).toBeCloseTo(20, 5);
    expect(g[2]).toBeCloseTo(50, 5); // el hueco, con su propio flex-grow
    expect(parcial).toContain('class="barra-resto"');
    const lleno = html({ segmentos: [{ clave: "a", nombre: "A", valor: 60, clase: "bg-tinta" }, { clave: "b", nombre: "B", valor: 40, clase: "bg-verde" }], total: 100 });
    expect(lleno).not.toContain("barra-resto");
    // un total menor que la suma no encoge nada: la barra llena la pista
    const corto = html({ segmentos: [{ clave: "a", nombre: "A", valor: 60, clase: "bg-tinta" }, { clave: "b", nombre: "B", valor: 40, clase: "bg-verde" }], total: 50 });
    expect(corto).not.toContain("barra-resto");
    expect(grows(corto).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it("`color` pinta la capa interna con un valor de CSS (un token) cuando no cabe en una clase", () => {
    const h = html({ segmentos: [{ clave: "e", nombre: "Efectivo", valor: 5, color: "var(--color-metodo-efectivo)" }] });
    expect(h).toContain('<i aria-hidden="true" class="barra-tramo-color" style="background:var(--color-metodo-efectivo)"></i>');
  });
});

describe("BarraApilada · lo que pidió la revisión de la migración", () => {
  const dos: SegmentoBarra[] = [
    { clave: "a", nombre: "Medio 1", valor: 1000, clase: "bg-tinta" },
    { clave: "b", nombre: "Medio 2", valor: 0, clase: "bg-tinta/55" },
  ];

  it("`viva`: un tramo en 0 sigue montado (para que se reacomode sin aparecer de golpe), sin entrada creciendo", () => {
    const h = html({ segmentos: dos, viva: true });
    expect(h).toContain("data-viva");
    expect(h.match(/class="barra-tramo"/g)).toHaveLength(2);
    expect(h).not.toContain("anim-crece-x");
    expect(h).toContain('data-cero=""'); // el que vale 0
    expect(grows(h)[1]).toBe(0);
    // sin `viva`, el tramo en 0 no se dibuja
    expect(tramosDe(html({ segmentos: dos }))).toBe(1);
  });

  it("`viva` deja el hueco siempre montado (con 0 si no hay), para que también se reacomode", () => {
    expect(html({ segmentos: dos, viva: true })).toContain('class="barra-resto" style="flex-grow:0"');
    expect(html({ segmentos: dos, viva: true, total: 4000 })).toMatch(/class="barra-resto" style="flex-grow:75"/);
  });

  it("`sinEntrada` quita solo la entrada; el resto sigue igual", () => {
    const h = html({ sinEntrada: true });
    expect(h).not.toContain("anim-crece-x");
    expect(h.match(/class="barra-tramo"/g)).toHaveLength(2);
    expect(h).not.toContain("data-viva");
  });

  it("una barra `decorativa` no pone texto al pasar el mouse; una que se lee, sí, con la cifra bien dicha", () => {
    expect(html({ decorativa: true })).not.toContain("title=");
    expect(html({ formato: (n) => `S/ ${n}` })).toContain('title="Vencida: S/ 5133.6"');
  });

  it("`decorativa` gana a `respuesta`: sus tramos no serían enfocables dentro de algo oculto", () => {
    const h = html({ decorativa: true, respuesta: { onApuntar: () => {}, onElegir: () => {} } });
    expect(h).not.toContain("<button");
    expect(h).toContain('aria-hidden="true"');
  });

  it("un tramo con `href` hace que la barra responda aunque la pantalla no pase `respuesta`", () => {
    const h = html({ segmentos: [{ clave: "p", nombre: "P", valor: 1, clase: "bg-tinta", href: "/x" }, { clave: "q", nombre: "Q", valor: 1, clase: "bg-verde" }] });
    expect(h).toContain('role="group"');
    expect(h).toContain('<a ');
  });

  it("un valor que no es un número no borra la barra: cuenta como 0", () => {
    const h = html({ segmentos: [{ clave: "a", nombre: "A", valor: Number.NaN, clase: "bg-tinta" }, { clave: "b", nombre: "B", valor: 4, clase: "bg-verde" }, { clave: "c", nombre: "C", valor: Number.POSITIVE_INFINITY, clase: "bg-rojo" }] });
    expect(h).toContain('aria-label="4 unidades. B: 4"');
    expect(tramosDe(h)).toBe(1);
  });

  it("la raíz es un <span>: válida dentro de un <span>, un <p> o un <button>", () => {
    expect(html().startsWith("<span ")).toBe(true);
    expect(html()).toContain("</span>");
  });
});
