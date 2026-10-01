// Las pantallas que se abren SIN sesión y sin tocarla, por delante de todo lo demás en `proxy.ts`. Lógica pura: la
// importa `proxy.ts` y la prueba `rutas-publicas.test.ts`.
//
// Hoy son las del Club CAYLA (ADR-0288 act. g), que abre una clienta en su celular, desde internet, sin cuenta:
//   · `/club/<uuid de la tienda>`: el registro, al que llevan el QR del cartel y el del ticket. Sus dos acciones de servidor
//     (`consultarNombre`, `registrarme`) viajan como POST a esta misma dirección, así que también pasan, y se validan solas
//     (`app/actions/club-registro.ts`);
//   · `/club/privacidad` y `/club/terminos`: los textos que acepta al unirse.
// `/login` y `/auth` NO van aquí: esas sí miran la sesión (quien ya entró no vuelve al login).
//
// Por qué tan estrecha: toda ruta que pasa sin sesión es una puerta abierta a internet. Pasa `/club/` seguido de UN uuid o de
// uno de esos dos nombres, y nada más: ni `/club` a secas, ni `/club/<uuid>/otra-cosa`, ni `/club/cualquier-cosa` (una
// pantalla que alguien agregue mañana bajo `/club/` no queda pública sin querer), ni `/clubes`. Lo que hay detrás no se abre
// por estar aquí: `anon` solo puede leer `fn_club_pagina`, y escribir lo hace el servidor con la llave de servicio.

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PAGINAS_DEL_CLUB = new RegExp(`^/club/(?:${UUID}|privacidad|terminos)/?$`);

/** ¿Esta ruta se sirve sin sesión y sin pasar por ninguna otra barrera de `proxy.ts`? */
export function esRutaPublica(pathname: string): boolean {
  return PAGINAS_DEL_CLUB.test(pathname);
}
