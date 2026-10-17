import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para Tienda web (excepción del 2026-10-16, ADR-0430): Felipe pidió «nuevos diseños, sofisticados,
// amigables y con full animaciones» y eligió, entre dos, «ricas, una vez, sin bucle». La ventana se asienta, su barra recibe un barrido
// de luz, las teselas entran en cascada, el camino del pedido se dibuja y la bandeja entra en cascada; con la curva del sistema, solo
// colores del tema y apagado con «reducir movimiento». El único latido es el de `<Chip vivo>` (el punto de «por confirmar»), que es de
// la pieza única y no vive aquí.

const hoja = readFileSync(join(__dirname, "../app/estilos/tienda-web.css"), "utf8");
const css = hoja.replace(/\/\*[\s\S]*?\*\//g, "");

describe("tienda-web.css — los límites del movimiento (ADR-0136, excepción de Tienda web)", () => {
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

  it("ninguna animación dura más de 1,2 s (la cascada suma retraso, pero cada pieza es corta)", () => {
    for (const m of css.matchAll(/animation\s*:\s*[\w-]+\s+(\d+)ms/g)) {
      expect(Number(m[1]), `una animación de ${m[1]} ms`).toBeLessThanOrEqual(1200);
    }
  });

  it("solo colores del tema: ni un hex suelto ni rgb() (ADR-0169, ADR-0336)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it("las clases viven en @layer components y todo se apaga con prefers-reduced-motion", () => {
    expect(hoja.trimStart().startsWith("@layer components")).toBe(true);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Cada clase que anima aparece en el bloque de «reducir movimiento».
    const reducido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const animadas = [...css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)")).matchAll(/(\.tw-[\w-]+(?:::?[\w-]+)?)\s*\{[^}]*\banimation\s*:/g)].map((m) => m[1]!);
    expect(animadas.length).toBeGreaterThan(8);
    for (const c of new Set(animadas)) expect(reducido, `${c} no se apaga con «reducir movimiento»`).toContain(c);
  });
});

// Nada de Tienda web late por su cuenta: un `repeatCount="indefinite"` o un `animate-*` de Tailwind (que repiten) sería un bucle nuevo
// sin decisión de Felipe.
describe("Tienda web — sin bucles en los componentes", () => {
  const carpeta = join(__dirname, "../components/tienda-web");
  const tsx = readdirSync(carpeta).filter((f) => f.endsWith(".tsx"));
  it("existen las piezas del grupo", () => {
    expect(tsx.length).toBeGreaterThan(0);
  });
  for (const f of tsx) {
    it(f, () => {
      const codigo = readFileSync(join(carpeta, f), "utf8");
      expect(codigo).not.toMatch(/repeatCount="indefinite"/);
      expect(codigo).not.toMatch(/\banimate-(?:spin|ping|pulse|bounce)\b/);
    });
  }
});
