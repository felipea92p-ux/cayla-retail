import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para Catálogo ▸ Sellos (excepción del 2026-10-22): Felipe pidió «sofisticado, elegante y con full
// animaciones» y eligió la billetera de pases. El sello se estampa, el pase se abre, el título sube por su ranura, el detalle y las prendas
// entran en cascada y el visto se dibuja: UNA vez, con la curva del sistema, solo colores del tema y apagado con «reducir movimiento».
// El punto que respiraba junto a «rige hoy» en la maqueta quedó fuera: un bucle nuevo lo decide Felipe aparte.

const hoja = readFileSync(join(__dirname, "../app/estilos/sellos.css"), "utf8");
const css = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
const antesDeReducir = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("sellos.css — los límites del movimiento (ADR-0136, excepción de Sellos)", () => {
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

  it("las clases viven en @layer components y todo lo que anima se apaga con prefers-reduced-motion", () => {
    expect(hoja.trimStart().startsWith("@layer components")).toBe(true);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const reducido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const animadas = [...antesDeReducir.matchAll(/(\.sl-[\w-]+(?:\s*>\s*\*|::?[\w-]+|\s+[\w-]+)?)\s*\{[^}]*\banimation\s*:/g)].map((m) => m[1]!.replace(/\s+/g, " "));
    expect(animadas.length).toBeGreaterThanOrEqual(6);
    for (const c of new Set(animadas)) expect(reducido.replace(/\s+/g, " "), `${c} no se apaga con «reducir movimiento»`).toContain(c);
  });
});

// Nada de Sellos late por su cuenta: un `repeatCount="indefinite"` o un `animate-*` de Tailwind que se repite sería un bucle nuevo
// sin decisión de Felipe.
describe("Sellos — sin bucles en los componentes", () => {
  const carpeta = join(__dirname, "../components/sellos");
  const tsx = readdirSync(carpeta).filter((f) => f.endsWith(".tsx"));
  it("existen las piezas", () => {
    expect(tsx).toEqual(expect.arrayContaining(["SellosPantalla.tsx", "SelloTinta.tsx"]));
  });
  for (const f of tsx) {
    it(f, () => {
      const codigo = readFileSync(join(carpeta, f), "utf8");
      expect(codigo).not.toMatch(/repeatCount="indefinite"/);
      expect(codigo).not.toMatch(/\banimate-(?:spin|ping|pulse|bounce)\b/);
    });
  }
});
