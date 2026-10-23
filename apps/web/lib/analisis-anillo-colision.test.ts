import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El anillo de Análisis (`components/analisis/piezas.tsx`, clase `anillo`) comparte nombre de clase con la pieza única del sistema
// (`components/ui/Anillo.tsx`, ADR-0358). La del sistema dibuja su SVG como `position: absolute; inset: 0` (el arco va detrás de la
// cifra); el de Análisis lo necesita en el flujo, encima de su título y su botón. Sin la regla que lo devuelve, el SVG flotaba sobre los
// textos y los tres anillos de «Datos incompletos» se pisaban (hallazgo 5 de la auditoría del celular, 2026-10-23).

const carpeta = join(__dirname, "../app/estilos");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sistema = sinComentarios(readFileSync(join(carpeta, "avance-anillo-copiar.css"), "utf8"));
const analisis = sinComentarios(readFileSync(join(carpeta, "analisis.css"), "utf8")).replace(/\s+/g, "");

describe("el anillo de Análisis y la pieza del sistema comparten la clase `anillo`", () => {
  it("la pieza del sistema sigue dibujando su SVG como absoluto (si deja de hacerlo, este candado ya no hace falta)", () => {
    expect(sistema).toMatch(/\.anillo\s*>\s*svg\s*\{[^}]*position:\s*absolute/);
  });

  it("el CSS de Análisis devuelve el SVG de su anillo al flujo", () => {
    expect(analisis).toMatch(/\.anillosvg\{[^}]*position:static/);
    expect(analisis).toMatch(/\.anillosvg\{[^}]*inset:auto/);
  });
});
