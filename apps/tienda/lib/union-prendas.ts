import { ESCENA, PX_POR_CM, type Caja } from "./probador";

// La unión de lo de arriba con lo de abajo en la figura del probador (ADR-0449, Felipe 2026-10-17): el borde de abajo de la prenda de
// arriba y la pretina de la falda o del pantalón tienen que coincidir, como en una persona. Hasta ahora cada prenda se dibujaba a su
// largo en cm (el propio o el típico de su categoría) y su ancho salía de la proporción de su recorte: una falda de 55 cm de largo
// típico que de verdad mide 40 salía con la pretina más ancha que el polo y asomaba por los lados.
//
// Ahora la prenda de abajo se dibuja por su PRETINA, no por su largo: la pretina sigue al borde de abajo del torso de arriba, pero solo
// dentro de ±15 % de una cintura estándar (36 cm, `ANCHO_ESTANDAR_DE_LA_UNION`), y su largo sale de la forma de la foto (una mini y una maxi
// salen bien sin que nadie les anote nada). El margen existe porque una falda no cambia de tamaño al cambiar de blusa: con una blusa ajustada
// la unión coincide, y una oversize o un crop simplemente cuelga por encima de la pretina, como en una persona. Las dos medidas salen de la
// propia imagen del recorte, en el navegador (`useUnionDeLaFigura`): sin columnas nuevas y también para los recortes que ya existen.
// Lógica pura, sin navegador.

/** Opacidad (0–255) desde la que un píxel cuenta como prenda al medirla: el mismo corte con que el ERP busca la caja de la prenda. */
const UMBRAL_ALFA = 32;
/** Un tramo de prenda tiene que ocupar al menos esta fracción del ancho para contar como el torso: las mangas sueltas son más angostas. */
const TORSO_MINIMO = 0.3;
/** Una pretina ocupa al menos esta fracción del ancho de su prenda: menos es el cuello de una blusa, no la parte de arriba de una falda. */
const PRETINA_MINIMA = 0.15;

/** Lo que se mide de un recorte, en fracciones de su propio ancho y alto (no cambian si la imagen se achica). `null`: no se pudo medir. */
export type MedidaDelRecorte = {
  /** En qué parte del alto de la prenda termina el torso (0–1). */
  filaDelBorde: number | null;
  /** El ancho del torso justo ahí, sobre el ancho de la prenda (sin mangas sueltas). */
  borde: number | null;
  /** El ancho de la parte de arriba de la prenda (la pretina de una falda o de un pantalón), sobre su ancho. */
  pretina: number | null;
};

export const SIN_MEDIDA: MedidaDelRecorte = { filaDelBorde: null, borde: null, pretina: null };

/** El tramo contiguo de prenda más ancho de una fila de la imagen (en píxeles). */
function tramoMasAncho(rgba: ArrayLike<number>, ancho: number, y: number): number {
  let mejor = 0;
  let tramo = 0;
  const base = y * ancho * 4 + 3;
  for (let x = 0; x < ancho; x++) {
    if (rgba[base + x * 4] > UMBRAL_ALFA) {
      tramo++;
      if (tramo > mejor) mejor = tramo;
    } else {
      tramo = 0;
    }
  }
  return mejor;
}

/**
 * Mide un recorte (un PNG RGBA, 4 bytes por píxel): dónde termina el torso y cuánto mide ahí, y cuánto mide su parte de arriba. Se queda con
 * el tramo más ancho de cada fila, así dos mangas colgando a los lados del cuerpo no se suman al torso (si las mangas tocan el torso, el
 * borde sale más ancho y `cajaDeAbajoUnida` lo acota). Una imagen vacía o sin torso no se puede medir: todo `null`.
 */
export function medirRecorte(rgba: ArrayLike<number>, ancho: number, alto: number): MedidaDelRecorte {
  if (ancho <= 0 || alto <= 0 || rgba.length < ancho * alto * 4) return SIN_MEDIDA;
  const tramos = new Array<number>(alto);
  for (let y = 0; y < alto; y++) tramos[y] = tramoMasAncho(rgba, ancho, y);

  let fila = -1;
  for (let y = alto - 1; y >= 0; y--) {
    if (tramos[y] >= TORSO_MINIMO * ancho) {
      fila = y;
      break;
    }
  }
  let borde: number | null = null;
  let filaDelBorde: number | null = null;
  if (fila >= 0) {
    // Un borde curvo (un bajo redondeado) es más angosto en su última fila: se toma el más ancho de las filas de arriba.
    let m = 0;
    for (let y = Math.max(0, fila - Math.round(0.04 * alto)); y <= fila; y++) m = Math.max(m, tramos[y]);
    borde = m / ancho;
    filaDelBorde = (fila + 1) / alto;
  }

  let p = 0;
  const desde = Math.floor(0.01 * alto);
  for (let y = desde; y < Math.max(desde + 1, Math.ceil(0.05 * alto)); y++) p = Math.max(p, tramos[y]);
  const pretina = p / ancho >= PRETINA_MINIMA ? p / ancho : null;

  return { filaDelBorde, borde, pretina };
}

/** La cintura estándar de una pretina, plana (cm): la mitad de una cintura de 72 cm. Lo que se le deja de ancho a la pretina cuando la prenda de
 *  arriba no la pide. */
export const ANCHO_ESTANDAR_DE_LA_UNION = 36;
/** Cuánto puede alejarse la pretina de la cintura estándar para seguir al borde de la prenda de arriba (±15 %). */
export const HOLGURA_DE_LA_UNION = 0.15;
/** El largo más corto y el más largo (cm) que se le deja a una prenda de abajo al igualarla con la de arriba: una foto rara no dibuja un pantalón de 20 cm. */
export const LARGO_MINIMO_DE_ABAJO = 20;
export const LARGO_MAXIMO_DE_ABAJO = 120;
/** Cuánto entra la pretina bajo el borde del torso (px de la escena), para que no quede una línea de aire entre las dos. */
export const SOLAPE_DE_LA_UNION = 3;

/**
 * Dónde va la prenda de abajo para que su pretina siga al borde de abajo de la de arriba (dentro de ±15 % de la cintura estándar). `null` si no se puede (sin medidas, o
 * la prenda de arriba va metida —un body—): entonces se queda la caja de siempre, por su largo en cm. Es la misma regla para una falda, un
 * short y un pantalón: lo que se fija es la pretina; el largo sale de la forma de la foto, entre `LARGO_MINIMO_DE_ABAJO` y
 * `LARGO_MAXIMO_DE_ABAJO`.
 */
export function cajaDeAbajoUnida(
  arriba: { caja: Caja; medida: MedidaDelRecorte | null | undefined; metida: boolean },
  abajo: { proporcion: number; medida: MedidaDelRecorte | null | undefined },
): Caja | null {
  const a = arriba.medida;
  const b = abajo.medida;
  if (arriba.metida || !a || a.borde === null || a.filaDelBorde === null || !b || b.pretina === null) return null;
  if (!(abajo.proporcion > 0) || !(arriba.caja.w > 0) || !(arriba.caja.h > 0)) return null;
  const estandar = ANCHO_ESTANDAR_DE_LA_UNION * PX_POR_CM;
  const pretinaPx = Math.min(Math.max(arriba.caja.w * a.borde, estandar * (1 - HOLGURA_DE_LA_UNION)), estandar * (1 + HOLGURA_DE_LA_UNION));
  const h = Math.min(Math.max(pretinaPx / b.pretina / abajo.proporcion, LARGO_MINIMO_DE_ABAJO * PX_POR_CM), LARGO_MAXIMO_DE_ABAJO * PX_POR_CM);
  const w = h * abajo.proporcion;
  return {
    x: Math.round(ESCENA.ancho / 2 - w / 2),
    y: Math.round(arriba.caja.y + arriba.caja.h * a.filaDelBorde - SOLAPE_DE_LA_UNION),
    w: Math.round(w),
    h: Math.round(h),
  };
}
