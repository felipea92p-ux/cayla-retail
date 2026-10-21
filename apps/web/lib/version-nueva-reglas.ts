/**
 * Aviso «hay una versión nueva» — la parte pura.
 *
 * EL PROBLEMA. Cada fusión a `main` publica una versión nueva de la web (el 14-oct-2026 fueron 39; en horas de tienda,
 * unas 6 por hora). Pero un equipo que tiene CAYLA abierto —sobre todo Vender, que no se cambia de pantalla en todo el
 * día— sigue con el JavaScript con el que cargó. Antes no se enteraba de nada. Y no es un descuido de Next: el proyecto
 * tiene la protección de versiones de Vercel activa (12 h), que a propósito deja a una pestaña vieja hablando con SU
 * versión vieja para que no se rompa a medias. Es seguro, pero silencioso: nadie le dice que hay algo nuevo.
 *
 * LA DECISIÓN. Cada pestaña lleva grabado el id de la versión con la que se armó (`NEXT_PUBLIC_BUILD_ID`, el commit que
 * Vercel construye) y, con la pestaña a la vista, le pregunta cada pocos minutos a `/api/version` cuál es la que está
 * en producción. Si no coinciden, `<VersionNueva />` pone una franja informativa con «Actualizar». NUNCA recarga sola: en
 * Vender el ticket que se está armando vive solo en la pantalla (lo que el navegador guarda son las ventas por subir y los
 * tickets puestos «en espera», no el que está en curso), y recargar bajo quien cobra lo perdería.
 *
 * LO QUE ESTO NO HACE. No distingue una versión importante de una menor (con ~6 por hora, la franja saldrá seguido: por eso
 * es discreta y se puede dejar para después). Y con la red caída no dice nada: sin respuesta no hay aviso, nunca un error.
 */

/** Cada cuánto, con la pestaña a la vista, se le pregunta a la web cuál es la versión de ahora. */
export const CADA_MS_PREGUNTAR_VERSION = 5 * 60_000;

/** Al volver a la pestaña o a la red se pregunta enseguida, pero no más de una vez por minuto. */
export const MIN_MS_ENTRE_PREGUNTAS = 60_000;

/** Cuánto calla la franja después de «Más tarde». Pasado ese tiempo, si sigue habiendo versión nueva, vuelve. */
export const MS_MAS_TARDE = 30 * 60_000;

/** La versión de una compilación fuera de Vercel (`next dev` en una máquina): ahí no hay nada que comparar. */
export const VERSION_SIN_DATO = "desarrollo";

/**
 * El id que devolvió `/api/version`, o `null` si la respuesta no es lo que se esperaba (una página de login, un error, un
 * cuerpo vacío): en ese caso no se sabe, y no saber nunca se convierte en aviso.
 */
export function leerVersion(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const id = (cuerpo as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const limpio = id.trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(limpio) ? limpio : null;
}

/**
 * ¿La versión de producción es otra que la de esta pestaña? «Otra», no «más nueva»: si se vuelve atrás una versión (un
 * rollback), las pestañas que cargaron la que se retiró también deben recargar. Sin dato de alguno de los dos lados, no.
 */
export function hayVersionNueva(propia: string, enProduccion: string | null): boolean {
  if (!enProduccion || !propia) return false;
  if (propia === VERSION_SIN_DATO || enProduccion === VERSION_SIN_DATO) return false;
  return propia !== enProduccion;
}

/** ¿Toca preguntar ahora por un evento (volver a la pestaña, volver la red)? No más de una vez por `MIN_MS_ENTRE_PREGUNTAS`. */
export function tocaPreguntar(ahoraMs: number, ultimaMs: number | null): boolean {
  return ultimaMs === null || ahoraMs - ultimaMs >= MIN_MS_ENTRE_PREGUNTAS;
}
