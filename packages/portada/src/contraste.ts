// La aritmética del color de una portada: mezclar dos colores y medir si una letra se lee sobre un fondo (contraste WCAG 2.x). Es pura
// y sin dependencias, para que la tienda y el ERP midan con la misma regla: si el ERP dice «se lee», la tienda lo pinta igual.

/** El mínimo para leer texto normal (WCAG AA): la descripción y la ceja de la portada son texto chico. */
export const CONTRASTE_MINIMO = 4.5;

/** «#a1b2c3» o «#abc» → [r, g, b] de 0 a 255. */
export function hexRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Color inválido: ${hex}`);
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** El color que queda de llevar `a` hacia `b` en la proporción `p` (0 = a, 1 = b). */
export function mezclar(a: string, b: string, p: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return rgbHex(A.map((v, i) => v + (B[i] - v) * p));
}

/** Luminancia relativa (WCAG 2.x): 0 es negro, 1 es blanco. */
export function luminancia(hex: string): number {
  const pesos = [0.2126, 0.7152, 0.0722];
  return hexRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((suma, c, i) => suma + c * pesos[i], 0);
}

/** Contraste entre dos colores, de 1 (iguales) a 21 (negro sobre blanco). El orden no importa. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** El color con transparencia, como lo escribe la tienda en sus tokens: «rgba(246, 239, 230, .10)». */
export function conAlfa(hex: string, alfa: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa.toFixed(2).replace(/^0/, "")})`;
}
