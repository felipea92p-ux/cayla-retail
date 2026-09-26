// Luz y nitidez de las fotos de prenda (ADR-0228, act. 2026-09-26). Lógica pura, sin navegador: la usa
// `preparar-foto.ts` sobre los píxeles de un canvas, y la prueban sus pruebas. Sin imports de `@/`: vitest local no los
// resuelve.
//
// La regla que ordena todo este archivo: MEJORAR LA FOTO SIN CAMBIAR LA PRENDA. La clienta compra por la foto, y un
// celeste que sale gris —o al revés— es una devolución. Por eso:
//   · La luz se corrige con UNA sola curva lineal, la misma para rojo, verde y azul. Así el tono (el «qué color es»)
//     no se mueve: solo cambia qué tan clara y con cuánto contraste se ve. No se toca el balance de blancos, que es
//     justamente lo que convierte un celeste en gris.
//   · La curva tiene tope: nunca aclara más de `GANANCIA_MAXIMA`, y si la foto ya está bien, no hace nada.
//   · Nada de IA generativa: todo es aritmética sobre los píxeles que ya estaban. Nada se inventa.

/** Por debajo de cuánto se considera «sombra» y por encima «luz» al medir la foto: el 0,5 % más oscuro y el 0,5 % más
 *  claro de la prenda no cuentan (un botón negro o un brillo no deciden la luz de toda la prenda). */
export const PERCENTIL_EXTREMO = 0.005;

/** Lo más que se estira el contraste. 1,35 levanta una foto tomada con poca luz sin volverla artificial; más, y las
 *  arrugas y el ruido del celular empiezan a notarse. */
export const GANANCIA_MAXIMA = 1.35;

/** Lo más oscuro que se lleva a negro. Una prenda negra de verdad no tiene que volverse más negra de lo que es. */
export const NEGRO_MAXIMO = 30;

/** Si la corrección sería menor que esto, la foto ya está bien y no se toca (ni se ofrece el botón). */
export const GANANCIA_MINIMA_UTIL = 1.06;

export type CurvaDeLuz = { negro: number; ganancia: number };

/** Luminancia percibida (0–255) de un píxel, con los pesos estándar de Rec. 601. */
export function luminancia(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Histograma de luminancia de los píxeles que cuentan: los que tienen alfa por encima de `alfaMinimo` (la prenda, en un
 * recorte), o todos si la imagen no trae transparencia.
 */
export function histogramaDeLuz(rgba: ArrayLike<number>, alfaMinimo = 128): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < alfaMinimo) continue;
    h[Math.round(luminancia(rgba[i], rgba[i + 1], rgba[i + 2]))]++;
  }
  return h;
}

function percentil(h: Uint32Array, total: number, p: number): number {
  const objetivo = total * p;
  let acumulado = 0;
  for (let v = 0; v < 256; v++) {
    acumulado += h[v];
    if (acumulado > objetivo) return v;
  }
  return 255;
}

/**
 * La curva que lleva la sombra de la prenda hacia el negro y su luz hacia el blanco, con los topes de arriba. `null` si
 * la foto ya está bien (o no hay prenda que medir).
 */
export function curvaDeLuz(h: Uint32Array): CurvaDeLuz | null {
  let total = 0;
  for (const n of h) total += n;
  if (total === 0) return null;
  const sombra = percentil(h, total, PERCENTIL_EXTREMO);
  const luz = percentil(h, total, 1 - PERCENTIL_EXTREMO);
  if (luz <= sombra) return null; // prenda de un solo tono plano: no hay contraste que estirar
  const negro = Math.min(sombra, NEGRO_MAXIMO);
  const ganancia = Math.min(255 / (luz - negro), GANANCIA_MAXIMA);
  if (ganancia < GANANCIA_MINIMA_UTIL) return null;
  return { negro, ganancia };
}

/** Aplica la curva a rojo, verde y azul por igual (el tono no se mueve). Modifica `rgba` en el lugar; el alfa no se toca. */
export function aplicarCurva(rgba: Uint8ClampedArray, c: CurvaDeLuz): void {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (rgba[i] - c.negro) * c.ganancia;
    rgba[i + 1] = (rgba[i + 1] - c.negro) * c.ganancia;
    rgba[i + 2] = (rgba[i + 2] - c.negro) * c.ganancia;
  }
}

/** Cuánto se refuerzan los bordes al final. Muy poco a propósito: compensa el achicado a 1200×1500, no «mejora» la tela. */
export const NITIDEZ = 0.35;

/**
 * Nitidez leve (máscara de enfoque 3×3): a cada píxel se le suma `cantidad` veces su diferencia con el promedio de sus
 * vecinos. Una zona pareja (el fondo blanco, un paño liso) no cambia; solo se marcan un poco los bordes y la trama.
 * Devuelve una imagen nueva; el borde de un píxel queda igual.
 */
export function enfocar(rgba: Uint8ClampedArray, ancho: number, alto: number, cantidad = NITIDEZ): Uint8ClampedArray {
  const salida = new Uint8ClampedArray(rgba);
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = (y * ancho + x) * 4;
      for (let c = 0; c < 3; c++) {
        let suma = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) suma += rgba[i + (dy * ancho + dx) * 4 + c];
        const promedio = suma / 9;
        salida[i + c] = rgba[i + c] + cantidad * (rgba[i + c] - promedio);
      }
    }
  }
  return salida;
}
