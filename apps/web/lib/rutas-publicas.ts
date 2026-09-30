// Las pantallas que se abren SIN sesión y sin tocarla, por delante de todo lo demás en `proxy.ts`. Lógica pura: la
// importa `proxy.ts` y la prueba `rutas-publicas.test.ts`.
//
// Hoy es una sola: la página del QR personal de una socia (`/club/<token>`, ADR-0288 act. c), que abre una clienta en
// su celular, desde internet, sin cuenta. `/login` y `/auth` NO van aquí: esas sí miran la sesión (quien ya entró no
// vuelve al login).
//
// Por qué tan estrecha: toda ruta que pasa sin sesión es una puerta abierta a internet. Pasa `/club/` seguido de UN
// segmento (el token) y nada más: ni `/club` a secas, ni `/club/<token>/otra-cosa`, ni `/clubes`. La acción de
// servidor de esa página viaja como POST a la misma dirección, así que también pasa (y se valida sola:
// `app/actions/club.ts`). Lo que hay detrás no se abre por estar aquí: la base solo le concede a `anon` las dos
// funciones de la invitación.

const PAGINA_DEL_CLUB = /^\/club\/[^/]+\/?$/;

/** ¿Esta ruta se sirve sin sesión y sin pasar por ninguna otra barrera de `proxy.ts`? */
export function esRutaPublica(pathname: string): boolean {
  return PAGINA_DEL_CLUB.test(pathname);
}
