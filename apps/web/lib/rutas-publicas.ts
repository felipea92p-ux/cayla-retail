// Las pantallas que se abren SIN sesión y sin tocarla, por delante de todo lo demás en `proxy.ts`. Lógica pura: la
// importa `proxy.ts` y la prueba `rutas-publicas.test.ts`.
//
// Hoy son las del Club CAYLA (ADR-0288 act. g), que abre un cliente en su celular, desde internet, sin cuenta:
//   · `/club/<uuid de la tienda>`: la dirección de los carteles ya impresos. Desde el 2026-10-16 solo lleva a la tienda online
//     (tienda.cayla.pe), donde se crea la cuenta y se entra al Club (20261016154000); el registro que vivía aquí, con sus acciones
//     de servidor y su `/api/club/nombre`, se retiró;
//   · `/club/privacidad` y `/club/terminos`: los textos que aceptó quien se unió por el cartel.
// Y las dos del aviso de «sin conexión con la base» (ADR-0450): `/sin-base`, la pantalla donde se espera cuando la base no
// responde, y `/api/salud`, la pregunta «¿responde la base?» que esa pantalla y el vigía de GitHub repiten. No muestran ningún dato.
// `/login` y `/auth` NO van aquí: esas sí miran la sesión (quien ya entró no vuelve al login).
//
// Por qué tan estrecha: toda ruta que pasa sin sesión es una puerta abierta a internet. Pasa `/club/` seguido de UN uuid o de
// uno de esos dos nombres, y nada más: ni `/club` a secas, ni `/club/<uuid>/otra-cosa`, ni `/club/cualquier-cosa` (una
// pantalla que alguien agregue mañana bajo `/club/` no queda pública sin querer), ni `/clubes`. Lo que hay detrás no se abre
// por estar aquí: `anon` solo puede leer `fn_club_pagina`.

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const PAGINAS_DEL_CLUB = new RegExp(`^/club/(?:${UUID}|privacidad|terminos)/?$`);
// Exactas, sin subrutas ni `?`: el pathname nunca los trae.
const RUTAS_DE_LA_BASE_CAIDA = new Set(["/sin-base", "/api/salud"]);

/** ¿Esta ruta se sirve sin sesión y sin pasar por ninguna otra barrera de `proxy.ts`? */
export function esRutaPublica(pathname: string): boolean {
  return PAGINAS_DEL_CLUB.test(pathname) || RUTAS_DE_LA_BASE_CAIDA.has(pathname);
}
