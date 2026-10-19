import type { Intensidad, Patron } from "./diseno";

// LOS ESTAMPADOS DEL FONDO «Con dibujo» (ADR-0436, actividad 7; los ocho de la maqueta, `patron()`). Cada uno es un dibujo chico que se
// repite. No lleva color: es una MÁSCARA, y el color lo pone la portada (el acento de la campaña, `--t-hero-acento`). Así el estampado
// cambia solo con el tema de la tienda (los colores de día y de noche se eligen en `heroe.css`), sin tener que dibujarlo dos veces.

/** Cuánto se ve el dibujo: «Suave» casi no se nota, «Fuerte» compite con el nombre (la revisión lo avisa). */
export const INTENSIDAD: Readonly<Record<Intensidad, number>> = { suave: 0.12, medio: 0.22, fuerte: 0.36 };

const huella = (x: number, y: number, r: number, s = 1) =>
  `<g transform='translate(${x} ${y}) rotate(${r}) scale(${s})'><ellipse cy='6' rx='7.5' ry='6.2'/><circle cx='-7.5' cy='-4' r='2.9'/><circle cx='-2.7' cy='-8.6' r='2.9'/><circle cx='2.7' cy='-8.6' r='2.9'/><circle cx='7.5' cy='-4' r='2.9'/></g>`;
const corazon = (x: number, y: number, s: number) =>
  `<path transform='translate(${x} ${y}) scale(${s})' d='M0 3.5C0-1.5 7-2 8 3 9-2 16-1.5 16 3.5 16 9 8 13 8 15 8 13 0 9 0 3.5Z'/>`;
const brillo = (x: number, y: number, s: number) =>
  `<path transform='translate(${x} ${y}) scale(${s})' d='M0-10Q1.6-1.6 10 0 1.6 1.6 0 10-1.6 1.6-10 0-1.6-1.6 0-10Z'/>`;

/** El dibujo de cada estampado: su tamaño (lo que mide antes de repetirse) y sus formas, en negro (la máscara solo mira dónde hay tinta). */
const DIBUJOS: Readonly<Record<Patron, { ancho: number; alto: number; formas: string }>> = {
  huellitas: { ancho: 110, alto: 110, formas: huella(28, 30, -20) + huella(80, 82, 18, 0.85) },
  rayas: { ancho: 18, alto: 18, formas: "<rect x='8' width='1.6' height='18'/>" },
  puntos: { ancho: 24, alto: 24, formas: "<circle cx='6' cy='6' r='2'/><circle cx='18' cy='18' r='2'/>" },
  cuadros: { ancho: 44, alto: 44, formas: "<rect width='22' height='44' opacity='.5'/><rect width='44' height='22' opacity='.5'/>" },
  corazones: { ancho: 80, alto: 80, formas: corazon(10, 12, 1.2) + corazon(50, 50, 0.9) },
  estrellas: {
    ancho: 100,
    alto: 100,
    formas: brillo(24, 24, 1.1) + brillo(72, 64, 0.7) + "<circle cx='70' cy='18' r='1.6'/><circle cx='22' cy='78' r='1.4'/>",
  },
  confeti: {
    ancho: 96,
    alto: 96,
    formas:
      "<rect x='10' y='14' width='9' height='4' rx='1' transform='rotate(-25 14 16)'/><rect x='60' y='22' width='10' height='4' rx='1' transform='rotate(35 65 24)'/>" +
      "<circle cx='40' cy='50' r='3'/><rect x='72' y='70' width='9' height='4' rx='1' transform='rotate(-10 76 72)'/><circle cx='18' cy='80' r='2.4'/>" +
      "<path d='M44 80 q4 -6 8 0 t8 0' stroke='black' stroke-width='2' fill='none'/>",
  },
  ondas: { ancho: 56, alto: 20, formas: "<path d='M0 10 Q14 0 28 10 T56 10' stroke='black' stroke-width='1.6' fill='none'/>" },
};

/** El estampado como imagen para `mask-image`: `url("data:image/svg+xml,…")`. */
export function mascaraDePatron(patron: Patron): string {
  const { ancho, alto, formas } = DIBUJOS[patron];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${ancho}' height='${alto}' viewBox='0 0 ${ancho} ${alto}'>${formas}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
