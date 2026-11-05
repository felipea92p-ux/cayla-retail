import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para Metas, Dinero, Gastos e Impuestos de Configuración (excepción del 2026-11-05): el mismo lenguaje de Las vitrinas. Cada pieza se arma UNA vez,
// con la curva del sistema, sin rebote ni bucle, solo con colores del tema y apagada con «reducir movimiento».

const crudo = readFileSync(join(__dirname, "../app/estilos/vidrio/config-vistas.css"), "utf8");
const css = crudo.replace(/\/\*[\s\S]*?\*\//g, "");

describe("config-vistas.css — los límites del movimiento (ADR-0136, excepción de las vistas de Configuración)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(css).not.toMatch(/\binfinite\b/);
    expect(css).not.toMatch(/animation-iteration-count/);
  });

  it("toda animación usa la curva del sistema, y ninguna curva propia (sin rebote)", () => {
    expect(css).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
    const declaraciones = css.match(/(?:^|[\s;{])animation\s*:[^;}]+/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(5);
    for (const d of declaraciones.filter((x) => !/:\s*none\b/.test(x))) expect(d, `«${d.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
  });

  it("cada pieza dura como mucho 1,2 s (la cascada suma retraso, pero cada una es corta)", () => {
    for (const m of css.matchAll(/(?:^|[\s;{])animation\s*:\s*([\w-]+)\s+(\d+)ms/g)) expect(Number(m[2]), `«${m[1]}» dura ${m[2]} ms`).toBeLessThanOrEqual(1200);
    for (const m of css.matchAll(/(?:^|[\s;{])animation\s*:\s*([\w-]+)\s+(\d+(?:\.\d+)?)s\b/g)) expect(Number(m[2]), `«${m[1]}» dura ${m[2]} s`).toBeLessThanOrEqual(1.2);
  });

  it("todo keyframe que entra se apaga con «reducir movimiento»", () => {
    const reducidos = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    for (const m of css.matchAll(/([^{}\n]+)\{[^{}]*animation\s*:\s*(?!none)[^;}]+/g)) {
      const clase = m[1]!.trim().split(/[ ,]/).find((x) => x.startsWith(".")) ?? "";
      if (!clase) continue;
      expect(reducidos, `${clase} no se apaga con «reducir movimiento»`).toContain(clase);
    }
  });

  it("un :hover vive dentro de @media (hover: hover)", () => {
    const fuera = css.replace(/@media \(hover: hover\) \{[^\n]*\}/g, "");
    expect(fuera).not.toMatch(/:hover/);
  });

  it("el vidrio es neutro: el color de la sede no tiñe el bloque, solo su tubo, su nodo o su día (Felipe: «más sutil y más ordenado»)", () => {
    const bloque = css.slice(css.indexOf(".cv-bloque {"), css.indexOf("}", css.indexOf(".cv-bloque {")));
    expect(bloque).not.toMatch(/var\(--c\)/);
  });

  it("solo colores del tema: ni un hex suelto ni rgb()", () => {
    expect(crudo).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
