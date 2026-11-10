import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tareas 158 y 161: la letra que se lee en Finanzas.
//   · 158: en «Qué debes», vencimientos, proveedores y detalles se leían a 12–13.5 px; la regla del ERP pide 14 px para lo
//     que se lee (las versalitas y las etiquetas de gráfico quedan aparte).
//   · 161: los gráficos de barras de Finanzas se escalan a su caja; con el lienzo de 560 del Flujo, la letra quedaba en ~6 px
//     a 375 px. Bajo 560 px la letra crece según el lienzo, y en los gráficos por semana se dicen menos montos para que no
//     se pisen.

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** El `font-size` en px de la primera regla cuyo selector es exactamente `selector` (dentro de `css`). */
function tamanoDe(css: string, selector: string): number | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
  const t = m && /font-size:\s*([\d.]+)px/.exec(m[1]!);
  return t ? Number(t[1]) : null;
}

/** El cuerpo del primer `@media (max-width: <ancho>)` (con llaves balanceadas). */
function bloqueMedia(css: string, ancho: string): string {
  const i = css.indexOf(`@media (max-width: ${ancho})`);
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
  it("el título de «En qué se va» queda sobre su detalle (15 px)", () => {
    expect(tamanoDe(css, ".qd-tipo-cab b")).toBe(15);
  });
  it("«vencida hace 12 días» no se parte en la fila ancha", () => {
    expect(css).toMatch(/\.qd-fac-vence small\s*\{\s*white-space:\s*nowrap;/);
  });
  it("control: el lector de tamaños ve un 12 px viejo", () => {
    expect(tamanoDe(".qd-pie { font-size: 12.5px; }", ".qd-pie")).toBe(12.5);
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
  const bajo560 = bloqueMedia(css, "559.98px");
  const bajo440 = bloqueMedia(css, "439.98px");

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
