/**
 * Los parámetros del QR de una etiqueta, en un solo lugar.
 *
 * POR QUÉ ESTÁN ACÁ Y NO DENTRO DEL COMPONENTE. Misma razón que `lib/codigo128.ts`:
 * la hoja de prueba impresa tiene que dibujar EXACTAMENTE lo que dibuja la app. Si
 * cada uno tuviera sus propios números, la hoja mediría otra cosa — que es justo el
 * error que casi cometemos con el código de barras el 2026-09-09.
 *
 * `components/CodigoQR.tsx` y `scripts/etiquetas/hoja-de-prueba.mjs` leen de acá.
 */

/** Lado del QR impreso. 18 mm entra cómodo en la etiqueta de 62 × 29 mm. */
export const LADO_QR_MM = 18;

/**
 * Corrección de errores media (~15%). Es la elección estándar de retail: suficiente
 * para una etiqueta rozada o doblada, sin densificar el código de más.
 */
export const NIVEL_QR = "M" as const;

/**
 * Zona muda, en módulos. La norma pide 4 y no es decorativa: sin ella el lector no
 * encuentra dónde empieza el código. Es el error más común al imprimir QR.
 */
export const ZONA_MUDA_MODULOS = 4;

/**
 * Lado del viewBox que usa la librería. El tamaño REAL lo fija el estilo en
 * milímetros; esto es solo la resolución interna del dibujo.
 */
export const LADO_VIEWBOX_PX = 256;

/**
 * Desde acá el QR necesita una versión mayor y sus módulos se achican de más para
 * el tamaño impreso. Un QR versión 2 con corrección media guarda 38 caracteres
 * alfanuméricos, y los códigos de CAYLA están muy por debajo:
 *
 *   CIN-0001-U          10
 *   BLU-0042-AZM-M      14
 *   BLU-0042-AZM-XXL    16   ← el más largo que produce el sistema
 *
 * A 18 mm, un QR de 21-25 módulos más 8 de zona muda da ~0.55 mm por módulo, o sea
 * ~6.4 puntos a 300 dpi. El mínimo práctico son 4.
 *
 * Y a diferencia de Code 128, acá NO hay techo de 15 caracteres — que es lo que
 * dejaba afuera a una talla XXL.
 */
export const MAX_CARACTERES_COMODOS = 38;

/** Puntos de impresora por módulo, para saber si el QR impreso se va a leer. */
export function puntosPorModuloQR(
  modulosDeLado: number,
  { ladoMm = LADO_QR_MM, dpi = 300 } = {}
): number {
  const total = modulosDeLado + ZONA_MUDA_MODULOS * 2;
  return ladoMm / total / (25.4 / dpi);
}

/**
 * Módulos de lado de un QR (sin zona muda), según su versión.
 * Versión 1 = 21, y cada versión suma 4.
 */
export function modulosDeVersion(version: number): number {
  return 17 + version * 4;
}
