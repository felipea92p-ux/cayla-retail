import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-0611 y ADR-0136: en Estados financieros el vidrio y sus gráficos se mueven una vez, sin rebote ni bucle, y todo se apaga con «reducir movimiento».
const css = readFileSync("app/estilos/vidrio/estados.css", "utf8");
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("el movimiento de Estados financieros (ADR-0611)", () => {
  it("nada en bucle", () => {
    expect(sinComentarios).not.toMatch(/\binfinite\b/);
  });

  it("nada que rebote: ninguna curva pasa de 1", () => {
    for (const [, curva] of sinComentarios.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
      const [, y1, , y2] = curva!.split(",").map(Number);
      expect(y1! <= 1 && y2! <= 1 && y1! >= 0 && y2! >= 0, curva).toBe(true);
    }
  });

  it("toda animación vive dentro de `prefers-reduced-motion: no-preference`", () => {
    const bloques = [...sinComentarios.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("");
    const fuera = sinComentarios.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(fuera).not.toMatch(/\banimation(-name)?\s*:/);
    if (/\banimation\s*:/.test(sinComentarios)) expect(bloques).toMatch(/\banimation\s*:/);
  });

  it("solo vale en esta pantalla: toda regla de pieza va bajo `.estados-vidrio` o es una pieza propia", () => {
    for (const [, selector] of sinComentarios.matchAll(/^([.:][^{@\n]*?)\s*[{,]$/gm)) {
      expect(/estados|hilos/.test(selector!), selector).toBe(true);
    }
  });
});

describe("Estados financieros no toca el resto del ERP", () => {
  it("la letra la pone solo su layout, y sin tela de hilos detrás de las cifras (camino A, 2026-11-06)", () => {
    const layout = readFileSync("app/(app)/finanzas/reportes/layout.tsx", "utf8");
    expect(layout).toContain("estados-vidrio");
    expect(layout).not.toContain("TelaHilos");
  });
});
