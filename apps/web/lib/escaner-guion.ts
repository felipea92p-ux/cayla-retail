// El guion que la pistola escribe como apóstrofo (2026-09-29, Tienda TRU: «CMS-0011-ROS-STD» llegaba como «CMS'0011'ROS'STD»).
//
// Una pistola de códigos de barras se hace pasar por un teclado, pero no manda LETRAS: manda POSICIONES de tecla (la del
// guion de un teclado US). El sistema operativo las traduce con la distribución que tenga puesta la computadora, y en una
// distribución en español esa posición es el apóstrofo (`'`); el guion vive en otra tecla. Las letras y los números no se
// notan porque están en el mismo sitio en las dos, y por eso solo se rompe el guion — que es justo lo que separa
// referencia, color y talla en el código de cada prenda (`fn_asignar_codigo_variante`).
//
// El arreglo de raíz es del equipo (la pistola en modo «teclado español», o la Mac en US mientras se escanea), pero no se
// puede pedir que cada sede lo tenga bien: el ERP lee el apóstrofo como guion. Ningún código de CAYLA lleva un apóstrofo
// de verdad (son letras, números y guiones; los de fábrica, solo dígitos), así que cambiarlo no confunde una prenda con otra.
//
// Sin DOM y sin dependencias, para importarlo igual desde `buscar-prenda-v2`, el conteo y Existencias.

/** Lo que la pistola escribe en lugar del guion, según la distribución del teclado: `'` en español/Latinoamérica. */
const COMO_LLEGA_EL_GUION = /'/g;

/** El texto de una lectura con el guion en su sitio. Es simétrico a propósito: se aplica a lo escaneado Y a lo guardado, de
 *  modo que un nombre con apóstrofo («O'Neil») se sigue encontrando escribiendo «o'neil». */
export function guionDeLaPistola(texto: string): string {
  return texto.replace(COMO_LLEGA_EL_GUION, "-");
}
