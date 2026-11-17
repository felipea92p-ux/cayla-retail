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

/**
 * EL NAVEGADOR OLVIDA LO QUE APRENDIÓ ANTES DE ESTA CUENTA (2026-11-16: «salí de la cuenta de Felipe, entré con una terminal y se quedó
 * cargando; al recargar el login, sí entró»).
 *
 * EL PROBLEMA. Next guarda en el navegador, por 5 minutos, a qué pantalla lleva cada dirección para no volver a preguntarlo. Pero lo
 * aprende con la sesión que había en ese momento: justo al salir, el marco todavía a la vista precarga «/» SIN sesión, el servidor la
 * manda al login, y Next anota «"/" es el login». Al entrar con otra cuenta, el login navega a «/», Next usa esa nota sin preguntarle al
 * servidor, «llega» al mismo login y el botón se queda en «Entrando…». Recargar pide la página de verdad: por eso entraba. Lo mismo vale
 * para lo que aprendió con la cuenta anterior (su Inicio que redirigía a Vender, una pantalla que le decía «Sin acceso»). Visto en
 * producción el 2026-11-16 (tres entradas seguidas sin un solo pedido de «/» al servidor) y reproducido en un banco local.
 * `router.refresh()` no lo arregla: vacía los datos de las pantallas, no esas notas.
 *
 * LA SALIDA. Lo que Next prevé para la autenticación: cambiar una cookie dentro de una Server Action le dice al navegador que olvide todo
 * lo aprendido (`marcarCambioDeCuenta`, `app/actions/entrada.ts`). El login la llama al abrir la sesión, a la par de la pregunta de a
 * dónde entrar, y recién después navega. La cookie no guarda nada (se borra, y no existe): es solo la señal.
 */
export const COOKIE_CAMBIO_DE_CUENTA = "cayla_cambio_de_cuenta";

/**
 * ¿El proxy saca del login a quien ya tiene sesión? Solo al ABRIR la página (GET o HEAD) y sin un motivo en la dirección
 * (`?error=sin_persona`: se queda para mostrarlo). Nunca un POST: es la Server Action del propio login (`marcarCambioDeCuenta`), que viaja
 * a `/login` con la sesión recién abierta; redirigida al Inicio, se perdía y el navegador no olvidaba lo de antes.
 */
export function saleDelLogin({ haySesion, metodo, tieneError }: { haySesion: boolean; metodo: string; tieneError: boolean }): boolean {
  return haySesion && !tieneError && (metodo === "GET" || metodo === "HEAD");
}

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
