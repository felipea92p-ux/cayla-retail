import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VISTO_MS } from "./configuracion-casilla";

// Candado de los límites de ADR-0136 para Las vitrinas de Configuración ▸ Empresa y tiendas (excepción del 2026-11-04): Felipe pidió «full animaciones y sofisticada» y «siempre
// siguiendo el estilo de liquid glass». Cada instrumento se arma UNA vez, con la curva del sistema, sin rebote ni bucle, solo con colores del tema y apagado con «reducir
// movimiento». Lo único que sigue vivo es lo que sigue al mouse, y eso no se mueve solo.

const crudo = readFileSync(join(__dirname, "../app/estilos/vidrio/vitrinas-sedes.css"), "utf8");
const css = crudo.replace(/\/\*[\s\S]*?\*\//g, "");
const REDUCIR = "@media (prefers-reduced-motion: reduce)";
const vista = readFileSync(join(__dirname, "../components/vitrinas-sedes/VistaEmpresaTiendas.tsx"), "utf8");

describe("vitrinas-sedes.css — los límites del movimiento (ADR-0136, excepción de Las vitrinas)", () => {
  it("ninguna animación se repite: nada en bucle", () => {
    expect(css).not.toMatch(/\binfinite\b/);
    expect(css).not.toMatch(/animation-iteration-count/);
  });

  it("toda animación y transición con duración usa la curva del sistema, y ninguna curva propia (sin rebote)", () => {
    expect(css).not.toMatch(/cubic-bezier|linear\(|spring|bounce/i);
    const declaraciones = css.slice(0, css.indexOf(REDUCIR)).match(/(?:^|[\s;{])animation\s*:[^;}]+/g) ?? [];
    expect(declaraciones.length).toBeGreaterThan(20);
    for (const d of declaraciones.filter((x) => !/:\s*none\b/.test(x))) expect(d, `«${d.trim()}» no usa var(--ease-cayla)`).toMatch(/var\(--ease-cayla\)/);
  });

  it("cada pieza dura como mucho 1,2 s (la cascada suma retraso, pero cada una es corta); solo el ✓ dura lo que dura su visto", () => {
    for (const m of css.matchAll(/(?:^|[\s;{])animation\s*:\s*([\w-]+)\s+(\d+)ms/g)) {
      const tope = m[1] === "vs-visto" ? VISTO_MS : 1200;
      expect(Number(m[2]), `«${m[1]}» dura ${m[2]} ms`).toBeLessThanOrEqual(tope);
    }
  });

  it("todo se apaga con «reducir movimiento», y el JavaScript no sigue al mouse", () => {
    const reducido = css.slice(css.indexOf(REDUCIR));
    expect(reducido).toMatch(/animation:\s*none\s*!important/);
    expect(reducido).toMatch(/transition:\s*none\s*!important/);
    expect(vista).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("un :hover vive dentro de @media (hover: hover), y la inclinación no pasa de 1,5°", () => {
    for (const bloque of css.split(/@media \(hover: hover\) \{/).slice(0, 1)) expect(bloque).not.toMatch(/:hover/);
    expect(vista).toMatch(/- 0\.5\) \* -2\.4\}deg/);
    expect(vista).toMatch(/- 0\.5\) \* 2\.4\}deg/);
  });

  it("el vidrio es neutro: el color de la sede no tiñe la tarjeta (Felipe: «más sutil y más ordenado»)", () => {
    const bloques = [".vs-liquido {", ".vs-dato {", ".vs-gota {"].map((b) => css.slice(css.indexOf(b), css.indexOf("}", css.indexOf(b))));
    for (const b of bloques) expect(b).not.toMatch(/var\(--c\)/);
    expect(crudo).not.toMatch(/url\(#/);
  });

  it("solo colores del tema: ni un hex suelto ni rgb(), salvo la máscara que se pinta en negro", () => {
    const sinMascaras = crudo.split("\n").filter((l) => !l.includes("tema-fijo:")).join("\n");
    expect(sinMascaras).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
