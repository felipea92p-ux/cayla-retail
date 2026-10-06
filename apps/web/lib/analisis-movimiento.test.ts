import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para Análisis (excepción del 2026-10-06, ADR-0357): Felipe aprobó la maqueta con su
// movimiento —piezas que entran en cascada, barras que crecen, perchas que asoman, arcos que se dibujan, el flujo que corre—,
// y esa excepción vale con sus límites: sin bucle, sin rebote, con la curva del sistema, solo colores del tema y apagada con
// «reducir movimiento». Revisa TODAS las hojas `app/estilos/analisis*.css` (la base y las de cada pestaña).

const carpeta = join(__dirname, "../app/estilos");
const hojas = readdirSync(carpeta).filter((f) => /^analisis.*\.css$/.test(f));
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("analisis*.css — los límites del movimiento (ADR-0136, excepción de Análisis)", () => {
  it("existe la hoja base", () => {
    expect(hojas).toContain("analisis.css");
  });

  for (const hoja of hojas) {
    const css = sinComentarios(readFileSync(join(carpeta, hoja), "utf8"));
    if (css.trim() === "") continue;
    describe(hoja, () => {
      it("ninguna animación se repite: nada en bucle", () => {
        expect(css).not.toMatch(/\binfinite\b/);
      });
      it("toda animación y transición usa la curva del sistema (`--ease-cayla`), salvo apagarlas", () => {
        const declaraciones = css.match(/(?:animation|transition)\s*:[^;}]+[;}]/g) ?? [];
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
      it("las clases de componente viven en @layer components (ADR-0105)", () => {
        expect(css.trimStart().startsWith("@layer components")).toBe(true);
      });
      it("si anima algo, se apaga con prefers-reduced-motion", () => {
        if (/animation\s*:|transition\s*:/.test(css)) expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      });
    });
  }
});

// El único bucle de Análisis (ADR-0136, act. 2026-10-06 (b), pedido de Felipe): los puntos que corren por la cinta del flujo de «Qué
// hacer hoy» MIENTRAS el mouse o el foco está encima. Vive en un solo componente, se dibuja solo para el camino que está encima y con
// «reducir movimiento» no se dibuja. Otro `repeatCount="indefinite"` en Análisis sería un bucle nuevo sin decisión.
describe("Análisis — el único bucle: los puntos del flujo bajo el mouse", () => {
  const componentes = join(__dirname, "../components/analisis");
  const tsx = readdirSync(componentes).filter((f) => f.endsWith(".tsx"));
  it("solo PestanaHoy.tsx repite una animación", () => {
    const conBucle = tsx.filter((f) => /repeatCount="indefinite"/.test(readFileSync(join(componentes, f), "utf8")));
    expect(conBucle).toEqual(["PestanaHoy.tsx"]);
  });
  it("los puntos se dibujan solo con un camino encima y nunca con «reducir movimiento»", () => {
    const hoy = readFileSync(join(componentes, "PestanaHoy.tsx"), "utf8");
    const puntos = hoy.slice(hoy.indexOf("function PuntosCinta"), hoy.indexOf("function Franja"));
    expect(puntos).toContain("useMovimientoReducido()");
    expect(puntos).toMatch(/if \(reducido\) return null;/);
    expect(hoy).toMatch(/activoIzq && <PuntosCinta/);
    expect(hoy).toMatch(/activoDer && <PuntosCinta/);
  });
});
