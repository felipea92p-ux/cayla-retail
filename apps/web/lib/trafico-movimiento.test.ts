import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de los límites de ADR-0136 para Tienda web ▸ Tráfico (act. 2026-10-23 (d), ADR-0495; «Observatorio» desde 2026-10-28): los 100
// puntos de «Hasta dónde llega la gente» se encienden UNA vez; con la curva del sistema, solo colores del tema y apagado con «reducir
// movimiento». El único bucle es una señal: el punto verde de «N mirando ahora». (La vitrina de baldosas, con su cascada, su etiqueta que
// se cuelga y su luz, se fue en la actividad 6.)

const hoja = readFileSync(join(__dirname, "../app/estilos/trafico.css"), "utf8");
const css = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
const antesDeReducir = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("trafico.css — los límites del movimiento (ADR-0136, excepción de Tráfico)", () => {
  it("un solo bucle, y es el punto verde de «Ahora, N mirando»", () => {
    const bucles = [...css.matchAll(/animation\s*:\s*([\w-]+)[^;]*\binfinite\b/g)].map((m) => m[1]);
    expect(bucles).toEqual(["trafico-respira"]);
    expect(css).toMatch(/\.trafico-punto-vivo::after\s*\{[^}]*trafico-respira/);
  });

  it("toda animación y transición usa la curva del sistema (`--ease-cayla`), salvo apagarlas", () => {
    const declaraciones = css.match(/(?:animation|transition)\s*:[^;}]+[;}]/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(4);
    for (const d of declaraciones.filter((x) => !/:\s*none\b/.test(x))) expect(d, `«${d.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
  });

  it("sin rebote: ninguna curva propia", () => {
    expect(css).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
  });

  it("cada pieza que entra dura 1,2 s o menos (la cascada suma retraso, la pieza es corta); el punto respira lento, a 2,4 s", () => {
    for (const m of css.matchAll(/animation\s*:\s*([\w-]+)\s+(\d+)ms/g)) {
      expect(Number(m[2]), `«${m[1]}» dura ${m[2]} ms`).toBeLessThanOrEqual(m[1] === "trafico-respira" ? 2400 : 1200);
    }
  });

  it("solo colores del tema: ni un hex suelto ni rgb() (ADR-0169, ADR-0336)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it("todo lo que se mueve se apaga con prefers-reduced-motion", () => {
    const reducido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const animadas = [...antesDeReducir.matchAll(/(\.trafico-[\w-]+(?:::?[\w-]+)?)\s*\{[^}]*\banimation\s*:/g)].map((m) => m[1]!);
    expect(animadas.length).toBeGreaterThanOrEqual(2);
    for (const c of new Set(animadas)) expect(reducido, `${c} no se apaga con «reducir movimiento»`).toContain(c);
  });

  it("el hover de una celda del mapa de calor vive dentro de (hover: hover)", () => {
    expect(antesDeReducir).toMatch(/@media \(hover: hover\)\s*\{\s*\.trafico-calor-celda:hover/);
  });
});

// Nada de Tráfico late por su cuenta en los componentes: un `repeatCount="indefinite"` o un `animate-*` de Tailwind que repite sería un
// bucle nuevo sin decisión de Felipe.
describe("Tráfico — sin bucles en los componentes", () => {
  const carpeta = join(__dirname, "../components/trafico");
  const tsx = readdirSync(carpeta).filter((f) => f.endsWith(".tsx"));
  it("existen las piezas de la pantalla", () => {
    expect(tsx.length).toBeGreaterThan(5);
  });
  for (const f of tsx) {
    it(f, () => {
      const codigo = readFileSync(join(carpeta, f), "utf8");
      expect(codigo).not.toMatch(/repeatCount="indefinite"/);
      expect(codigo).not.toMatch(/\banimate-(?:spin|ping|pulse|bounce)\b/);
    });
  }
});
