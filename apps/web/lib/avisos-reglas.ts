/**
 * Reglas puras de los avisos de arriba a la derecha (`components/ui/Avisos.tsx`, ADR-0146): cuánto dura
 * cada uno y qué pasa con la pila cuando la pantalla se ocupa con otra petición (ADR-0149). Sin React ni
 * DOM, para poder probarlas (`avisos-reglas.test.ts`).
 *
 * Nacen del 2026-10-14 (ADR-0146, «Actualización 2026-10-14»): en Producción, «Traer de vuelta» y luego
 * «Enviar a maquila» dejaban DOS «Deshacer» a la vista, y el primero volvía a aplicar una etapa vieja. Pasaba
 * porque, con otra petición en curso, las tarjetas se desmontaban y al liberarse la pantalla se montaban de
 * nuevo con el reloj desde cero: un aviso que la persona ya había visto resucitaba como si fuera nuevo.
 */

export type TonoAviso = "exito" | "error" | "aviso" | "proceso";

/** Lo que se va solo: éxito 4 s, advertencia 6 s, error 8 s. Un proceso no tiene reloj: lo cierra el código. */
export const DURACION: Record<TonoAviso, number | null> = { exito: 4000, aviso: 6000, error: 8000, proceso: null };

/**
 * Un aviso con un botón («Deshacer», «Recargar», «Agregar y registrar la bajada») hay que leerlo Y decidir:
 * 7 s como mínimo. Un «Deshacer» de 4 s es una trampa (lo dijo el comentario de `avisar.exito` desde el
 * 2026-09-21, pero cada pantalla tenía que acordarse de pasar `duracion`; Producción no lo hacía).
 */
export const DURACION_CON_ACCION = 7000;

/**
 * Cuánto dura un aviso a la vista, en ms, o `null` si no tiene reloj (proceso). Quien pide una `duracion`
 * decide (más larga o más corta); sin ella, un aviso con acción no baja de `DURACION_CON_ACCION`.
 */
export function duracionDe(tono: TonoAviso, opciones?: { accion?: unknown; duracion?: number }): number | null {
  if (tono === "proceso") return null;
  if (opciones?.duracion !== undefined) return opciones.duracion;
  const base = DURACION[tono] as number;
  return opciones?.accion ? Math.max(base, DURACION_CON_ACCION) : base;
}

export type EnLaPila = { id: number; tono: TonoAviso; visto: boolean };

/**
 * El reloj del aviso empezó a correr A LA VISTA (la tarjeta terminó su entrada): desde ahí cuenta como visto.
 * Devuelve la misma referencia si no cambia nada (`useSyncExternalStore` compara por identidad).
 */
export function conVisto<T extends EnLaPila>(pila: readonly T[], id: number): readonly T[] {
  const aviso = pila.find((a) => a.id === id);
  if (!aviso || aviso.visto) return pila;
  return pila.map((a) => (a.id === id ? { ...a, visto: true } : a));
}

/**
 * La pantalla se ocupó (otra carga o guardado, ADR-0149): lo que ya se vio no vuelve. La persona ya leyó
 * «Guardado» y pasó a lo siguiente; si vuelve a aparecer con el reloj nuevo parece otro guardado, y su
 * «Deshacer» ya es viejo (puede deshacer sobre un estado que cambió después). Lo que todavía no se vio se
 * queda esperando a que la pantalla se libere, como siempre. Un proceso nunca se retira: sigue corriendo.
 * Devuelve la misma referencia si no cambia nada.
 */
export function retirarLoVisto<T extends EnLaPila>(pila: readonly T[]): readonly T[] {
  const quedan = pila.filter((a) => a.tono === "proceso" || !a.visto);
  return quedan.length === pila.length ? pila : quedan;
}
