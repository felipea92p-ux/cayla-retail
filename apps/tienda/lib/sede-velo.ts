// El velo del cambio de tienda (ADR-0466, Felipe 2026-10-20: «velo», y que no sea invasivo: «un blur oscuro», no negro). Al elegir otra tienda
// en la cabecera, un velo oscuro y desenfocado cubre el catálogo (que se sigue viendo detrás, borroso), dice «Ahora ves lo que hay en
// LIMA» y se disipa cuando llega la página de la tienda nueva. Cambiar de tienda es la misma vista para `claveDeVista` (`?sede=`), así que
// Next no muestra ningún esqueleto: sin esto, la lista de antes se queda quieta (apenas atenuada) hasta que llega la nueva y nada dice
// «ahora estás en Lima». El velo es la pantalla de carga de ese cambio. Lógica pura, con su prueba al lado; el componente
// (`components/SelectorTienda.tsx`) solo la usa.

/** El aviso de ventana con el que cualquier botón de la página pide «cambiar de tienda» al selector de la cabecera («Ver lo que hay» de cada
 *  tienda). Así es EL MISMO cambio —cookie, velo, bolsa que se vacía con confirmación— y no una navegación suelta. `detail` es el `href`. */
export const EVENTO_CAMBIAR_TIENDA = "cayla:cambiar-tienda";

/** Cuánto tarda el velo en cubrir (ms): el fundido de entrada. */
export const VELO_ENTRA_MS = 320;
/** Lo que el velo se queda, como mínimo, DESPUÉS de cubrir (ms): si la página llega al instante, el nombre alcanza a leerse y el velo no
 *  parpadea. */
export const VELO_LECTURA_MS = 300;
/** Cuánto tarda el velo en disiparse (ms). */
export const VELO_SALE_MS = 380;
/** El tiempo mínimo que el velo está a la vista desde el toque: lo que cubre más lo que se lee. */
export const VELO_MINIMO_MS = VELO_ENTRA_MS + VELO_LECTURA_MS;
/** Principio 9 (todo puede fallar): si la página nunca llega (corte de red, la base no responde), el velo no se queda para siempre. A los 8 s
 *  se disipa solo, y la tienda sigue donde estaba con lo que la persona pueda hacer (el aviso de la base caída ya lo da `/sin-base`). */
export const VELO_TOPE_MS = 8000;

/** El reloj del velo (ms). Aparte, en este módulo, porque la regla de pureza de React no deja llamar a `Date.now` dentro de lo que se define
 *  en un componente aunque solo corra en un clic. */
export const ahoraMs = (): number => Date.now();

/** Cuánto falta (ms) para que el velo pueda empezar a disiparse, cuando la página ya llegó: lo que quede del mínimo. Nunca negativo. */
export function esperaParaSalir(transcurridoMs: number): number {
  return Math.max(0, VELO_MINIMO_MS - Math.max(0, transcurridoMs));
}

/** Cuánto falta (ms) para el tope, aunque la página no haya llegado. Nunca negativo. */
export function esperaHastaElTope(transcurridoMs: number): number {
  return Math.max(0, VELO_TOPE_MS - Math.max(0, transcurridoMs));
}

/**
 * ¿Hay que mostrar el velo al elegir esta tienda? Solo si es OTRA que la que se ve: elegir la misma no navega a ninguna parte, y un velo
 * que no tiene nada que esperar se quedaría hasta el tope.
 */
export function debeCubrir(actual: string | null | undefined, elegida: string): boolean {
  return Boolean(elegida) && elegida !== actual;
}

/** Las letras del nombre de la tienda, una por una (cada una sube desde su línea): sin espacios sueltos. */
export function letrasDelNombre(nombre: string): string[] {
  return [...nombre.trim()];
}
