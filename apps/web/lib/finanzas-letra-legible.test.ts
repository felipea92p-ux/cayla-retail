import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCALA } from "../tema/letra-suelta.mjs";

// Tareas 158 y 161: la letra que se lee en Finanzas.
//   · 158: en «Qué debes», vencimientos, proveedores y detalles se leían a 12–13.5 px; la regla del ERP pide 14 px para lo
//     que se lee (las versalitas y las etiquetas de gráfico quedan aparte).
//   · 161: los gráficos de barras de Finanzas se escalan a su caja; con el lienzo de 560 del Flujo, la letra quedaba en ~6 px
//     a 375 px. Bajo 560 px la letra crece según el lienzo, y en los gráficos por semana se dicen menos montos para que no
//     se pisen. Desde la auditoría responsive (2026-11-16) el corte mira el ancho del gráfico (`@container fin-grafico`), no el
//     de la ventana: a 1024 px con el lateral, Campañas y Escenarios viven en una columna de ~260 px y la letra quedaba en 6–7 px.

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * El `font-size` en px de la primera regla cuyo selector es exactamente `selector` (dentro de `css`). Desde ADR-0691 la letra de la
 * interfaz pide su tamaño a la escala (`var(--text-detalle)`): se traduce con la misma escala que usa el candado de la letra. La letra
 * de un dibujo (svg) sigue en unidades de su lienzo.
 */
function tamanoDe(css: string, selector: string): number | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
  const t = m && /font-size:\s*(?:([\d.]+)px|var\(--text-([a-z]+)\))/.exec(m[1]!);
  if (!t) return null;
  return t[1] ? Number(t[1]) : (ESCALA.find((e) => e.token === t[2])?.px ?? null);
}

/** El cuerpo del primer `<regla> (max-width: <ancho>)` (con llaves balanceadas): `@media` o `@container <nombre>`. */
function bloqueMedia(css: string, ancho: string, regla = "@media"): string {
  const i = css.indexOf(`${regla} (max-width: ${ancho})`);
  if (i < 0) return "";
  let nivel = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") nivel++;
    if (css[j] === "}" && --nivel === 0) return css.slice(i, j + 1);
  }
  return "";
}

/** Lo que mide en pantalla una letra de `unidades` dentro de un lienzo de `lienzo` dibujado en `cajaPx`. */
const enPantalla = (unidades: number, lienzo: number, cajaPx: number) => (unidades * cajaPx) / lienzo;

describe("Qué debes: lo que se lee no baja de 14 px (tarea 158)", () => {
  const css = leer("app/estilos/finanzas-que-debes.css");
  const LECTURAS = [
    ".qd-leyenda",
    ".qd-franja-pie p",
    ".qd-fac small",
    ".qd-fac-vence b",
    ".qd-pie",
    ".qd-aten span:not(.qd-aten-ic)",
    ".qd-prov small",
    ".qd-tipo-cab b",
    ".qd-tipo-cab small",
    ".qd-tipo-ley b",
    ".qd-tipo-ley small",
  ];
  it.each(LECTURAS)("%s mide 14 px o más", (sel) => {
    const t = tamanoDe(css, sel);
    expect(t, `${sel} no tiene font-size`).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(14);
  });
  it("el título de «En qué se va» queda sobre su detalle (16 px, el escalón de lo que se lee)", () => {
    expect(tamanoDe(css, ".qd-tipo-cab b")).toBe(16);
    expect(tamanoDe(css, ".qd-tipo-cab b")!).toBeGreaterThan(tamanoDe(css, ".qd-tipo-cab small")!);
  });
  it("«vencida hace 12 días» no se parte en la fila ancha", () => {
    expect(css).toMatch(/\.qd-fac-vence small\s*\{\s*white-space:\s*nowrap;/);
  });
  it("control: el lector de tamaños ve un 12 px viejo, y traduce un escalón de la escala", () => {
    expect(tamanoDe(".qd-pie { font-size: 12.5px; }", ".qd-pie")).toBe(12.5);
    expect(tamanoDe(".qd-pie { font-size: var(--text-xs); }", ".qd-pie")).toBe(13);
    expect(tamanoDe(".qd-pie { font-size: var(--text-detalle); }", ".qd-pie")).toBe(14);
  });
});

describe("Por pagar (todas): el detalle de cada fila usa la letra de detalle", () => {
  const tsx = leer("components/finanzas/PorPagarTodas.tsx");
  it("sin text-xs de lectura", () => {
    expect(tsx).not.toMatch(/<small className=[^>]*text-xs/);
    expect(tsx.match(/texto-detalle/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("Gráficos de Finanzas en el celular (tarea 161)", () => {
  const css = leer("app/estilos/finanzas.css");
  // Caja de 520 px o menos (el celular a 560, la columna angosta de una pantalla ancha) y de 400 o menos (el celular a 440).
  const bajo560 = bloqueMedia(css, "520px", "@container fin-grafico");
  const bajo440 = bloqueMedia(css, "400px", "@container fin-grafico");

  it("el gráfico es el contenedor que miran los cortes (sin él, ningún corte se aplica y no avisa)", () => {
    expect(css).toMatch(/\.fin-grafico\s*\{[^}]*container:\s*fin-grafico\s*\/\s*inline-size/);
    expect(bajo560, "falta el corte de 520 px").not.toBe("");
    expect(bajo440, "falta el corte de 400 px").not.toBe("");
  });
  it("a 375 px (caja de ~303 px) la letra de Flujo, Escenarios y Campañas mide 11 px o más", () => {
    for (const lienzo of [560, 460, 440]) {
      const t = tamanoDe(bajo440, `.fin-grafico svg[viewBox^="0 0 ${lienzo} "] text`);
      expect(t, `lienzo ${lienzo}`).not.toBeNull();
      expect(enPantalla(t!, lienzo, 303)).toBeGreaterThanOrEqual(11);
    }
  });
  it("a 440 px (caja de ~368 px) también", () => {
    for (const lienzo of [560, 460, 440]) {
      const t = tamanoDe(bajo560, `.fin-grafico svg[viewBox^="0 0 ${lienzo} "] text`);
      expect(t, `lienzo ${lienzo}`).not.toBeNull();
      expect(enPantalla(t!, lienzo, 368)).toBeGreaterThanOrEqual(10.9);
    }
  });
  it("los gráficos por semana callan los montos de en medio (se ven al tocar la barra)", () => {
    expect(bajo560).toMatch(/\.fin-grafico-lienzo text\.fin-grafico-valor\s*\{\s*display:\s*none;/);
    expect(bajo560).toMatch(/\.fin-grafico-barra:last-of-type:not\(\.fin-grafico-mala\) text\.fin-grafico-valor:first-of-type/);
    expect(bajo560).toMatch(/:not\(\.fin-grafico-mala\) \+ \.fin-grafico-mala text\.fin-grafico-valor:nth-of-type\(2\)/);
  });
  it("en escritorio la letra sigue igual (11.5 px)", () => {
    expect(tamanoDe(css, ".fin-grafico text")).toBe(11.5);
  });
  it("control: sin el bloque del celular, la letra del Flujo quedaría bajo 7 px", () => {
    expect(enPantalla(11.5, 560, 303)).toBeLessThan(7);
    expect(bloqueMedia("a{}", "559.98px")).toBe("");
  });
});
