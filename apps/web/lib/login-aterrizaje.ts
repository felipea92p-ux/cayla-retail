/**
 * El login entra directo a la pantalla de la cuenta, en UNA navegación (Felipe 2026-10-13: «al iniciar sesión hay un parpadeo muy breve y
 * se ve el inicio»).
 *
 * EL PROBLEMA. El login navegaba a `/` y el Inicio, ya en el servidor, redirigía a la pantalla que le toca a la cuenta (su pantalla principal,
 * el mostrador de una terminal, el tablero en CAYLA Global). Una redirección desde una página no se salta el paso: Next pinta primero `/` —la
 * app con «Inicio» marcado en el menú— y recién después pide el destino. Ahora el login le pregunta antes a `/api/aterrizaje` (la misma regla
 * del Inicio, `aterrizajeDe` en `lib/menu.ts`) y navega una sola vez, ahí.
 *
 * Aquí vive solo lo puro: qué se hace con esa respuesta y cuánto se la espera. Si no llega a tiempo o no se entiende, el login va a `/`, el
 * camino de siempre: el Inicio decide solo (y a una cuenta que no puede entrar la devuelve al login con su motivo). Lo peor que pasa es el
 * parpadeo de antes, nunca una pantalla equivocada (principio 9).
 */

/** A dónde va el login cuando no sabe a dónde: el Inicio, que decide solo. */
export const DESTINO_SI_NO_SE = "/";

/** Lo más que el login espera la respuesta de a dónde ir, en ms; pasado eso, va al Inicio. */
export const MS_TOPE_DEL_ATERRIZAJE = 5000;

/**
 * El destino que trae la respuesta, si es una pantalla de este mismo ERP («/inventario», «/»); cualquier otra cosa —nada, un texto que no es
 * una ruta, otro sitio («//otro.com», «https://…», «/\otro.com», que el navegador lee como otro sitio)— es «no sé».
 */
export function destinoDeLaRespuesta(cuerpo: unknown): string {
  const destino = typeof cuerpo === "object" && cuerpo !== null ? (cuerpo as { destino?: unknown }).destino : undefined;
  return typeof destino === "string" && /^\/(?![/\\])\S*$/.test(destino) ? destino : DESTINO_SI_NO_SE;
}
