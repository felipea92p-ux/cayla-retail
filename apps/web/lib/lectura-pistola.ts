// Reconocer que el campo de Vender lo escribió una pistola y no una persona (2026-09-29, pedido de Felipe: «al escanear
// tengo que dar Enter; debería pasar solo al ticket»).
//
// Una pistola de códigos de barras escribe el código completo en milisegundos y NO siempre remata con Enter: depende de
// cómo venga programada, y no se puede pedir que cada sede la reprograme. Sin Enter, el código se quedaba escrito
// esperando que alguien lo confirmara. La señal que sí tenemos es el RITMO: una persona separa cada tecla por 100–250 ms
// y una pistola por menos de 30. Cuando el campo deja de cambiar y lo último que entró fue una ráfaga así de rápida, esa
// ráfaga es una lectura y se resuelve como si hubiera llegado su Enter.
//
// Sin DOM ni reloj propio (la hora llega en cada cambio, del `timeStamp` del evento y no de `Date.now()`): así el ritmo
// que se mide es el de las teclas y no el de lo que tarde el navegador en pintar entre una y otra. Se prueba sin navegador.

/** Como máximo esto entre dos teclas para que sigan siendo la misma ráfaga. Una pistola no pasa de ~30 ms; una persona,
 *  sostenida sobre varias teclas seguidas, no baja de ~60 ms. */
export const MAX_MS_ENTRE_TECLAS = 50;

/** Cuántas teclas seguidas, a ese ritmo, hacen falta para tomarlas por una lectura. Un código de CAYLA tiene 14 o más
 *  caracteres y uno de barras 8 o más: con ocho, una palabra tecleada rápido no cuenta. */
export const TECLAS_MIN_LECTURA = 8;

/** Cuánto silencio después de la última tecla da por terminada la lectura. Más que `MAX_MS_ENTRE_TECLAS` (si no, cortaría
 *  la ráfaga a la mitad) y menos de lo que espera alguien mirando la pantalla. Si la pistola sí manda Enter, el Enter
 *  llega antes y resuelve la lectura primero: esto no la repite (el campo ya quedó vacío). */
export const PAUSA_FIN_LECTURA_MS = 150;

/** La ráfaga en curso: dónde empezó dentro del texto (`desde`, para no arrastrar lo que la persona ya había escrito),
 *  cuántas teclas lleva y cuándo fue la última. */
export type Rafaga = { desde: number; teclas: number; ultima: number };

/**
 * La ráfaga después de un cambio del campo. `anterior` y `valor` son el texto antes y después; `cuando`, la hora de la
 * tecla. Solo cuenta escribir al final: borrar o editar en medio no es una pistola y la ráfaga se pierde.
 */
export function conCambio(previa: Rafaga | null, anterior: string, valor: string, cuando: number): Rafaga | null {
  if (valor.length <= anterior.length || !valor.startsWith(anterior)) return null;
  const sigue = previa !== null && anterior !== "" && cuando - previa.ultima <= MAX_MS_ENTRE_TECLAS;
  return sigue ? { desde: previa.desde, teclas: previa.teclas + 1, ultima: cuando } : { desde: anterior.length, teclas: 1, ultima: cuando };
}

/**
 * El código que la pistola acaba de escribir en `valor`, o `null` si lo último que entró no parece una lectura: pocas
 * teclas, a ritmo de persona, o con espacios (un código no los tiene; una frase sí). Devuelve SOLO lo de la ráfaga, sin lo
 * que hubiera escrito antes: un texto suelto que quedó en el campo no se pega delante del código.
 */
export function lecturaDePistola(valor: string, rafaga: Rafaga | null): string | null {
  if (rafaga === null || rafaga.teclas < TECLAS_MIN_LECTURA) return null;
  const leido = valor.slice(rafaga.desde);
  return leido.length >= TECLAS_MIN_LECTURA && !/\s/.test(leido) ? leido : null;
}
