/**
 * Code 128 B, sin librerías, sin internet, sin depender de nadie. Es el estándar
 * retail que la pistola Zebra lee sin configurarle nada.
 *
 * ESTE ARCHIVO ES LÓGICA PURA A PROPÓSITO. La pinta `components/Codigo128.tsx`,
 * pero el cálculo vive acá para que cualquier verificación —una hoja de prueba
 * impresa, un test— mida EXACTAMENTE lo que la app imprime, y no una copia del
 * algoritmo que puede derivar sin que nadie lo note.
 *
 * POR QUÉ IMPORTA EL LARGO DEL TEXTO (y por qué existe el código corto, ADR-0025).
 * El SVG se dibuja con `preserveAspectRatio="none"`, así que se estira al ancho de
 * la etiqueta sin importar cuántas barras tenga: 14 caracteres y 40 caracteres
 * ocupan lo mismo, solo que con barras la mitad de finas. Y Code 128 se decodifica
 * por PROPORCIÓN de anchos, así que cuando cada módulo baja de ~3 puntos de
 * impresora, el redondeo del cabezal térmico deforma esa proporción y el lector
 * empieza a fallar.
 *
 *   BLU-0042-AZM-M        (14 ch) → 189 módulos → ~3.1 puntos/módulo a 300 dpi
 *   BLUSA-…-M-AZUL-MARINO (40 ch) → 475 módulos → ~1.2 puntos/módulo  ✗
 *
 * Esa aritmética es la razón declarada del código corto, y sigue sin verificarse
 * contra papel real. `scripts/etiquetas/hoja-de-prueba.mjs` genera la hoja para
 * medirlo.
 */

/** Tabla oficial de patrones Code 128 (anchos de barra/espacio por símbolo, 0-106). */
const PATRONES = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232",
];
const PATRON_STOP = "2331112";

export type Barras = {
  /** Path SVG de las barras, sobre un lienzo de alto 1 y ancho `total`. */
  d: string;
  /** Módulos totales. Es la medida que decide si la etiqueta se puede leer. */
  total: number;
};

/** Devuelve null si el texto tiene caracteres fuera de Code 128 B (ASCII 32-126). */
export function barrasCode128(texto: string): Barras | null {
  const valores: number[] = [];
  for (const ch of texto) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    valores.push(code - 32);
  }
  let checksum = 104; // start B
  valores.forEach((v, i) => (checksum += v * (i + 1)));
  checksum %= 103;

  const secuencia = [104, ...valores, checksum];
  const patron = secuencia.map((v) => PATRONES[v]).join("") + PATRON_STOP;

  // Un solo `<path>` en vez de ~100 `<rect>`. A 120 etiquetas por tanda es la
  // diferencia entre 12.000 nodos del DOM y 120: la computadora de la tienda tiene
  // que poder abrir el diálogo de impresión sin ahogarse.
  let d = "";
  let x = 0;
  let esBarra = true;
  for (const c of patron) {
    const w = Number(c);
    if (esBarra) d += `M${x} 0h${w}v1h-${w}z`;
    x += w;
    esBarra = !esBarra;
  }
  return { d, total: x };
}

/**
 * Puntos de impresora por módulo si el código se ESTIRA para llenar un ancho dado.
 * Se conserva para explicar por qué eso está mal, no para dibujar así.
 */
export function puntosPorModulo(modulos: number, anchoUtilMm = 50, dpi = 300): number {
  const mmPorPunto = 25.4 / dpi;
  return anchoUtilMm / modulos / mmPorPunto;
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * EL MÓDULO SE FIJA; EL ANCHO SE DEDUCE. NUNCA AL REVÉS.
 *
 * Descubierto el 2026-09-09 escaneando con el celular: los códigos se dibujaban
 * con `preserveAspectRatio="none"` y `width: 100%`, o sea que 189 módulos y 475
 * módulos ocupaban lo MISMO — el ancho de la etiqueta. Como Code 128 se decodifica
 * por PROPORCIÓN de anchos, y `shapeRendering="crispEdges"` además redondea cada
 * borde a la grilla del dispositivo, una barra de 2 módulos y otra de 3 terminaban
 * midiendo igual. El lector devolvía basura: `755123:1<7V90` en vez de
 * `7501234567890`, y ráfagas de dígitos donde tomaba un símbolo roto por el código
 * de "cambiar a subconjunto C".
 *
 * El encoder estaba —y está— bien: los patrones decodifican exacto y el checksum
 * cierra. Lo que estaba mal era estirar el dibujo.
 *
 * Ahora el módulo tiene un tamaño físico fijo y el código ocupa lo que ocupa. Eso
 * convierte "este código es demasiado largo" de un problema invisible (se imprimía
 * igual, ilegible) en uno imposible: no entra, y hay que decirlo antes de imprimir.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** 0.254 mm = exactamente 3 puntos a 300 dpi, el mínimo de la impresión térmica. */
export const MODULO_MM = 0.254;

/** Ancho útil del código dentro de una etiqueta de 62 mm, descontados los márgenes. */
export const ANCHO_UTIL_MM = 50;

export type Medida = {
  modulos: number;
  anchoMm: number;
  cabe: boolean;
  /** Cuántos caracteres entran como máximo con este módulo y este ancho. */
  maxCaracteres: number;
};

/**
 * Cuánto mide de verdad el código, y si entra en la etiqueta.
 *
 * Un Code 128 B mide `11·(n+2) + 2` módulos para n caracteres (start, datos,
 * checksum y stop), así que el límite de caracteres sale de despejar esa cuenta.
 */
export function medir(
  modulos: number,
  { moduloMm = MODULO_MM, anchoUtilMm = ANCHO_UTIL_MM } = {}
): Medida {
  const anchoMm = modulos * moduloMm;
  const modulosDisponibles = Math.floor(anchoUtilMm / moduloMm);
  return {
    modulos,
    anchoMm,
    cabe: anchoMm <= anchoUtilMm,
    maxCaracteres: Math.max(0, Math.floor((modulosDisponibles - 2) / 11) - 2),
  };
}
