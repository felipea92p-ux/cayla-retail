import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para «Ajustar stock» en el modal de la prenda de Existencias (excepción del 2026-10-23 (c),
// ADR-0494): Felipe pidió que la vista sea «sofisticada, elegante y full animaciones» y eligió la ronda 3 de la maqueta. La luz cruza la
// banda y el lápiz se dibuja, el hilo de la cabecera se dibuja, las filas llegan en cascada y las celdas en ola, el anillo se cierra sobre
// la talla en foco, el número rueda al cambiar, el talón entra, cada talla se sella al guardar y el sello «Guardado» se estampa: UNA vez,
// con la curva del sistema, solo colores del tema y apagado con «reducir movimiento». La tira de etiquetas es la de Editar producto (su
// movimiento vive en `ficha-taller.css`).

const hoja = readFileSync(join(__dirname, "../app/estilos/ajuste-modelo.css"), "utf8");
const css = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
const REDUCIR = "@media (prefers-reduced-motion: reduce)";
const antesDeReducir = css.slice(0, css.indexOf(REDUCIR));

describe("ajuste-modelo.css — los límites del movimiento (ADR-0136, excepción de la planilla de Existencias)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(css).not.toMatch(/\binfinite\b/);
    for (const m of css.matchAll(/animation-iteration-count\s*:\s*([^;]+);/g)) expect(m[1]!.trim()).toBe("1");
  });

  it("toda animación y transición usa la curva del sistema (`--ease-cayla`), salvo apagarlas", () => {
    const declaraciones = css.match(/(?:animation|transition)\s*:[^;}]+[;}]/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(10);
    for (const d of declaraciones.filter((x) => !/:\s*none\b/.test(x))) {
      expect(d, `«${d.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
    }
  });

  it("sin rebote: ninguna curva propia", () => {
    expect(css).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
  });

  it("ninguna animación ni transición dura más de 1,2 s (la cascada suma retraso, pero cada pieza es corta)", () => {
    for (const m of css.matchAll(/(?:animation|transition)\s*:[^;]*?(\d+)ms/g)) {
      expect(Number(m[1]), `«${m[0]}» dura ${m[1]} ms`).toBeLessThanOrEqual(1200);
    }
  });

  it("solo colores del tema: ni un hex suelto ni rgb() (ADR-0169, ADR-0336)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it("todo lo que anima se apaga con prefers-reduced-motion", () => {
    expect(css).toContain(REDUCIR);
    const reducido = css.slice(css.indexOf(REDUCIR)).replace(/\s+/g, " ");
    const animadas = [...antesDeReducir.matchAll(/([^{}]*\.(?:ajuste|banda-ajustar)[^{}]*)\{[^}]*\banimation\s*:/g)].map((m) => m[1]!.trim().replace(/\s+/g, " "));
    expect(animadas.length).toBeGreaterThanOrEqual(10);
    for (const c of new Set(animadas)) expect(reducido, `${c} no se apaga con «reducir movimiento»`).toContain(c);
  });
});

// Nada de la planilla late por su cuenta: un `animate-*` de Tailwind que se repite sería un bucle nuevo sin decisión de Felipe.
describe("la planilla de Existencias — sin bucles en los componentes", () => {
  for (const f of ["components/existencias/AjusteDelModelo.tsx", "components/existencias/PanelTalla.tsx"]) {
    it(f, () => {
      const codigo = readFileSync(join(__dirname, "..", f), "utf8");
      expect(codigo).not.toMatch(/repeatCount="indefinite"/);
      expect(codigo).not.toMatch(/\banimate-(?:spin|ping|pulse|bounce)\b/);
    });
  }
});
