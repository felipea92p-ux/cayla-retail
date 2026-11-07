/* ====================================================================
   «Atrás» cierra la hoja de arriba (ADR-0528, Felipe 2026-10-26) · las decisiones, sin navegador

   En el teléfono, cada hoja abierta (`<Modal>`, `<Cajon>`) deja una entrada en el historial con la MISMA URL y su marca. Estas
   funciones deciden qué hacer con esas entradas; quien toca `window.history` es `components/ui/useAtrasCierraLaHoja.ts`.
     · La pila: las hojas abiertas, en el orden en que se abrieron. Solo la de ARRIBA responde a «atrás»: un «atrás» = una hoja.
     · Las entradas: las nuestras que siguen en el historial, de abajo arriba. Una hoja que se cerró deja la suya hasta que se
       retira con un «atrás» propio (`cuantasRetirar`); una hoja abierta sin entrada la recibe (`cualesPoner`).
     · Una entrada huérfana: lleva la marca de una hoja que ya no está (se navegó desde la hoja, o se recargó). Volver a ella desde
       otra pantalla la salta, para que un «atrás» lleve a la pantalla y no a una entrada vacía.
   ==================================================================== */

/** La marca de la entrada de una hoja en `history.state`: guarda su id. */
export const MARCA_HOJA = "__hojaAbierta";

/** Una hoja que pidió cerrar con «atrás»: su id y la página (pathname) donde se abrió. */
export type HojaEnPila = { id: string; pagina: string };

export type AlVolver =
  /** No es un «atrás» sobre una hoja: el router sigue como siempre. */
  | "nada"
  /** La persona salió de la entrada de la hoja de arriba: se pide cerrarla (por la puerta de la ✕) y nadie más se entera. */
  | "cerrar"
  /** Se volvió desde otra pantalla a una entrada huérfana: el router dibuja la pantalla y la entrada se salta hacia atrás. */
  | "saltar";

/**
 * Qué hacer con un `popstate`, mirando a dónde se llegó. `arriba` es la hoja abierta de más arriba (o ninguna).
 * Se compara por página (pathname) y no por URL entera: una pantalla que cambia sus filtros con `replaceState` mueve la query
 * de la entrada de la hoja, y seguir siendo la misma pantalla es lo que importa.
 */
export function decidirAlVolver(e: {
  /** La marca de la entrada a la que se llegó (`null` si no tiene). */
  marca: string | null;
  /** La página a la que se llegó. */
  pagina: string;
  /** La página desde la que se llegó (la última que se vio). */
  paginaAntes: string;
  arriba: HojaEnPila | null;
  abiertas: readonly string[];
}): AlVolver {
  if (e.arriba) {
    // Se llegó a la entrada de la hoja de arriba (volviendo de una página abierta encima de ella): nada que cerrar.
    if (e.marca === e.arriba.id) return "nada";
    // Fue a otra pantalla (varios pasos de una vez, o «adelante»): no es un «atrás» sobre la hoja.
    if (e.pagina !== e.arriba.pagina) return "nada";
    return "cerrar";
  }
  if (!e.marca || e.abiertas.includes(e.marca)) return "nada";
  // Huérfana en la misma pantalla (se llegó con «adelante», o tras recargar): no se sabe hacia dónde saltar; se deja.
  return e.pagina !== e.paginaAntes ? "saltar" : "nada";
}

/** Cuántas entradas de arriba se retiran: las de hojas que ya cerraron, hasta la primera que sigue abierta. */
export function cuantasRetirar(entradas: readonly string[], abiertas: readonly string[]): number {
  let n = 0;
  while (n < entradas.length && !abiertas.includes(entradas[entradas.length - 1 - n])) n++;
  return n;
}

/** Las hojas abiertas que todavía no tienen su entrada, en el orden de la pila, solo las de la página donde se está. */
export function cualesPoner(pila: readonly HojaEnPila[], entradas: readonly string[], pagina: string): HojaEnPila[] {
  return pila.filter((h) => !entradas.includes(h.id) && h.pagina === pagina);
}

/**
 * ¿Un `replaceState` conserva la marca de la hoja? Next reescribe el estado de la entrada en cada `router.refresh()` sin copiar
 * lo ajeno (Next 16, `preserveCustomHistoryState: false`): sin esto, guardar dentro de una hoja le borraba su marca y su
 * entrada quedaba vacía, pidiendo un «atrás» de más. Solo si sigue siendo la misma página: si un `router.replace` lleva a otra,
 * la entrada ya es de esa otra pantalla y llevar la marca la haría pasar por huérfana.
 */
export function conservaMarca(paginaActual: string, paginaNueva: string): boolean {
  return paginaActual === paginaNueva;
}
