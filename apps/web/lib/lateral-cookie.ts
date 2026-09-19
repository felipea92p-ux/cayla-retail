// Preferencia del menú lateral (plegado a íconos o expandido).
//
// Es una COOKIE y no localStorage a propósito: el layout del servidor la lee y le pasa a `AppShell`
// el estado ya resuelto, así la primera pintura sale con el ancho correcto. Con localStorage el
// servidor pinta 17rem y el navegador lo salta a 4.75rem al hidratar — un parpadeo en cada carga.
// Es una preferencia de pantalla de esta máquina, no un dato del negocio: no vive en `personas`.
export const COOKIE_LATERAL = "cayla_lateral";
export const COOKIE_LATERAL_PLEGADO = "1";

/** Guarda la preferencia (solo desde el navegador). Un año; `SameSite=Lax` alcanza: el servidor solo la lee al pintar el layout. */
export function guardarLateralPlegado(plegado: boolean) {
  document.cookie = `${COOKIE_LATERAL}=${plegado ? COOKIE_LATERAL_PLEGADO : "0"}; path=/; max-age=31536000; samesite=lax`;
}
