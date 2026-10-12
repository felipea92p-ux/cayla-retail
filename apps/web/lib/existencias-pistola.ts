/* ====================================================================
   La pistola de códigos en Existencias, sin tocar el buscador (maqueta `existencias-tactil-2026-10`, «Simular pistola»)

   Una pistola «escribe» el código como un teclado, muy rápido, y termina con Enter. Una persona escribe despacio. Si las teclas llegan
   a menos de `MS_ENTRE_TECLAS` una de otra y el Enter cierra al menos `MIN_CARACTERES`, es una lectura: Existencias abre el panel de
   esa talla aunque el cursor no esté en el buscador. Si llega lento, no es la pistola y no se hace nada (la tecla sigue su camino:
   «/» al buscador, 1–7 a las acciones del panel). Lógica pura, con su prueba; el componente solo escucha el teclado.
   ==================================================================== */

/** Entre dos teclas de la pistola pasan pocos milisegundos; entre dos de una persona, bastante más. */
export const MS_ENTRE_TECLAS = 50;
/** Un código de etiqueta tiene al menos esto (los de CAYLA, bastante más): con menos, un Enter suelto no es una lectura. */
export const MIN_CARACTERES = 6;

export type LectorPistola = { texto: string; ultimo: number };
export const LECTOR_VACIO: LectorPistola = { texto: "", ultimo: 0 };

/** Una tecla que llegó en `ahora` (ms). Devuelve el lector nuevo y, con Enter, el código leído (o `null` si no era la pistola). */
export function teclaDePistola(l: LectorPistola, key: string, ahora: number): { lector: LectorPistola; codigo: string | null } {
  const seguida = ahora - l.ultimo < MS_ENTRE_TECLAS;
  if (key === "Enter") {
    const codigo = seguida && l.texto.length >= MIN_CARACTERES ? l.texto : null;
    return { lector: LECTOR_VACIO, codigo };
  }
  if (key.length !== 1) return { lector: LECTOR_VACIO, codigo: null };
  return { lector: { texto: seguida ? l.texto + key : key, ultimo: ahora }, codigo: null };
}

/** ¿Esta tecla es parte de una ráfaga (la pistola)? Para no tomar el primer dígito de un código como un atajo del panel. */
export function esRafaga(l: LectorPistola, ahora: number): boolean {
  return l.texto.length > 0 && ahora - l.ultimo < MS_ENTRE_TECLAS;
}

/** Una pistola que NO remata con Enter (depende de cómo venga programada): cuando la ráfaga se calla, lo leído es el código si
 *  alcanza el largo de una lectura de Vender (`TECLAS_MIN_LECTURA`, `lectura-pistola.ts`). El lector solo junta teclas seguidas
 *  (`teclaDePistola` empieza de nuevo tras una pausa), así que lo que tiene es una ráfaga, nunca algo tecleado a mano. */
export function lecturaSinEnter(l: LectorPistola, minimo: number): string | null {
  return l.texto.length >= minimo && !/\s/.test(l.texto) ? l.texto : null;
}
