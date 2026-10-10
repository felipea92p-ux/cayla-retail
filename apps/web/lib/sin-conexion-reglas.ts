/**
 * Qué pantallas se pueden ABRIR sin internet y cómo se sabe que lo que se ve es una copia (ADR-0210, paso 3).
 *
 * El service worker (`public/sw.js`) guarda la última copia de estas pantallas cada vez que se abren con red, y la
 * sirve cuando no hay red. Solo estas: son las que tienen cola sin conexión (vender, recibir, dar de alta). Guardar
 * copias de Finanzas o Colaboradores dejaría datos sensibles en el disco de un equipo compartido sin ganar nada —
 * sin red tampoco se podría guardar nada ahí.
 *
 * `sw.js` es JavaScript plano servido desde `public/` y no puede importar este archivo: repite la lista, y
 * `sin-conexion-reglas.test.ts` falla si las dos se separan.
 *
 * Vender, solo con la copia DE HOY (Felipe, 2026-09-25, «Copia de hoy»): vender con el stock de una copia de ayer
 * daría demasiadas ventas rechazadas o stock negativo al subir. La regla de dejar ≥1 unidad en piso sigue (ADR-0013).
 */

export type PantallaSinConexion = { ruta: string; nombre: string; soloDeHoy: boolean };

export const PANTALLAS_SIN_CONEXION: readonly PantallaSinConexion[] = [
  { ruta: "/vender", nombre: "Vender", soloDeHoy: true },
  { ruta: "/recibir", nombre: "Recibir mercadería", soloDeHoy: false },
  { ruta: "/productos/nuevo", nombre: "Nuevo producto", soloDeHoy: false },
];

/** La pantalla guardable de una ruta (ruta exacta, sin `?…`), o `null`. */
export function pantallaSinConexion(pathname: string): PantallaSinConexion | null {
  const limpia = pathname.replace(/\/+$/, "") || "/";
  return PANTALLAS_SIN_CONEXION.find((p) => p.ruta === limpia) ?? null;
}

/** El día calendario en Lima (AAAA-MM-DD) de un instante: la tienda cierra el día en hora de Lima, no en UTC. */
export function diaLima(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

/**
 * ¿Lo que se está viendo es una copia guardada y no una página recién pedida? El servidor sella cada carga con su
 * hora (`generadoEn`); una página real llega en segundos, una copia puede tener horas. 3 minutos de margen cubren un
 * reloj de caja algo desfasado sin confundir una copia de hace un rato con una página nueva.
 */
export const MS_MARGEN_COPIA = 3 * 60 * 1000;

export function esCopiaGuardada(generadoEn: string, ahora: Date): boolean {
  const edad = ahora.getTime() - new Date(generadoEn).getTime();
  return Number.isFinite(edad) && edad > MS_MARGEN_COPIA;
}

/**
 * ¿Hay red de verdad? (2026-10-10, caja de Trujillo). `navigator.onLine` en `false` NO es una certeza: ese día el Mac de
 * la caja de TRU la tuvo en `false` toda la mañana mientras registraba 15 ventas y cientos de lecturas contra la base. El
 * ERP le creía, así que pintaba «Sin conexión», dejaba de releer quién está de turno (la que volvía del refrigerio
 * seguía «en pausa») y apagaba los demás sondeos. Una respuesta real de la base pesa más que lo que dice el navegador:
 * si llegó una hace menos de `VENTANA_RED_MS`, hay red, diga lo que diga `navigator.onLine`.
 *
 * Al revés no se corrige: con `navigator.onLine` en `true` se dice que hay red aunque falle una lectura suelta (un
 * fallo aislado no merece el aviso); guardar nunca depende de esto, se intenta y, si falla, se encola (ADR-0210).
 */
export const VENTANA_RED_MS = 90_000;

export function hayRedReal(v: { navegadorDice: boolean; ultimaRespuestaMs: number | null; ahoraMs: number }): boolean {
  if (v.navegadorDice) return true;
  if (v.ultimaRespuestaMs === null) return false;
  const edad = v.ahoraMs - v.ultimaRespuestaMs;
  return edad >= 0 && edad < VENTANA_RED_MS;
}

/** ¿Esta respuesta prueba que hay red? Solo una de la base (Supabase): lo del propio sitio puede venir de la copia del
 *  service worker y respondería igual sin internet. */
export function pruebaRed(url: string, hostSupabase: string | null): boolean {
  if (!hostSupabase) return false;
  try {
    return new URL(url).host === hostSupabase;
  } catch {
    return false;
  }
}
