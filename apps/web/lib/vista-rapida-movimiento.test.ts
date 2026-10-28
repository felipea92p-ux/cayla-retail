import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 «Actualización 2026-10-05». La vista rápida de producto es la única hoja del ERP con movimiento rico por decisión
// de Felipe, y esa excepción se escribió con sus límites: sin bucle, sin rebote, con la curva del sistema, solo colores del tema y apagada con
// «reducir movimiento». Si alguien agrega una animación a `vista-rapida.css`, este archivo la revisa contra esos límites en vez de confiar en la memoria.

const css = readFileSync(join(__dirname, "../app/estilos/vista-rapida.css"), "utf8");
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("vista-rapida.css — los límites del movimiento (ADR-0136, 2026-10-05)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(sinComentarios).not.toMatch(/\binfinite\b/);
  });

  it("toda animación y transición usa la curva del sistema (`--ease-cayla`), nunca una propia (salvo apagarlas: `none`)", () => {
    const declaraciones = sinComentarios.match(/(?:animation|transition)\s*:[^;]+;/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(10);
    for (const d of declaraciones.filter((x) => !/:\s*none\b/.test(x))) {
      expect(d, `«${d.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
    }
  });

  it("sin rebote: ninguna curva con sobreimpulso ni cubic-bezier suelto", () => {
    expect(sinComentarios).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
  });

  it("ninguna animación dura más de 1,2 s (la ola de 45 celdas suma retraso, pero cada pieza es corta)", () => {
    for (const m of sinComentarios.matchAll(/animation\s*:\s*[\w-]+\s+(\d+)ms/g)) {
      expect(Number(m[1]), `una animación de ${m[1]} ms`).toBeLessThanOrEqual(1200);
    }
  });

  it("solo colores del tema: ni un hex suelto (ADR-0169)", () => {
    expect(sinComentarios).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("todo se apaga con prefers-reduced-motion, y la entrada, la ola y la onda están en la lista", () => {
    const bloque = sinComentarios.slice(sinComentarios.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const pieza of [".vr-titulo", ".vr-cel", ".vr-onda", ".vr-capa[data-nueva", ".vr-foto::after"]) {
      expect(bloque, `${pieza} no se apaga con movimiento reducido`).toContain(pieza);
    }
  });

  it("las clases de componente viven en @layer components (ADR-0105)", () => {
    expect(sinComentarios.trimStart().startsWith("@layer components")).toBe(true);
  });
});
