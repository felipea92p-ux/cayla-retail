import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para la hoja «Configuración» de una campaña (excepción del 2026-10-23, ADR-0488): Felipe pidió
// «elegante, sofisticado y con full animaciones» y eligió la II de la maqueta. El hilo de la etiqueta se dibuja, la etiqueta baja y se
// asienta, el descuento entra al cambiar, las casillas entran en cascada y cada pieza del mosaico aparece: UNA vez, con la curva del
// sistema, solo colores del tema y apagado con «reducir movimiento». El vuelo (`vuelo.ts`) y el sello (`SelloTinta`) traen sus propios
// candados (los de «Prendas» y los de Insignias).

const hoja = readFileSync(join(__dirname, "../app/estilos/campana-hoja.css"), "utf8");
const css = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
const REDUCIR = "@media (prefers-reduced-motion: reduce)";
const antesDeReducir = css.slice(0, css.indexOf(REDUCIR));

describe("campana-hoja.css — los límites del movimiento (ADR-0136, excepción de la hoja de campaña)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(css).not.toMatch(/\binfinite\b/);
    for (const m of css.matchAll(/animation-iteration-count\s*:\s*([^;]+);/g)) expect(m[1]!.trim()).toBe("1");
  });

  it("toda animación y transición usa la curva del sistema (`--ease-cayla`), salvo apagarlas", () => {
    const declaraciones = css.match(/(?:animation|transition)\s*:[^;}]+[;}]/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(6);
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
    const animadas = [...antesDeReducir.matchAll(/([.\w\s-]*\.(?:cph|eqp)-[\w.-]+(?:\s+\.[\w.-]+)*)\s*\{[^}]*\banimation\s*:/g)].map((m) => m[1]!.trim().replace(/\s+/g, " "));
    expect(animadas.length).toBeGreaterThanOrEqual(6);
    for (const c of new Set(animadas)) expect(reducido, `${c} no se apaga con «reducir movimiento»`).toContain(c);
  });
});

// Nada de la hoja late por su cuenta: un `repeatCount="indefinite"` o un `animate-*` de Tailwind que se repite sería un bucle nuevo sin
// decisión de Felipe.
describe("la hoja de campaña — sin bucles en los componentes", () => {
  const carpeta = join(__dirname, "../components/campana-hoja");
  const tsx = readdirSync(carpeta).filter((f) => f.endsWith(".tsx"));
  it("existen las piezas", () => {
    expect(tsx).toEqual(expect.arrayContaining(["EtiquetaDeCampana.tsx", "CategoriasDeCampana.tsx"]));
  });
  for (const f of tsx) {
    it(f, () => {
      const codigo = readFileSync(join(carpeta, f), "utf8");
      expect(codigo).not.toMatch(/repeatCount="indefinite"/);
      expect(codigo).not.toMatch(/\banimate-(?:spin|ping|pulse|bounce)\b/);
    });
  }
});
