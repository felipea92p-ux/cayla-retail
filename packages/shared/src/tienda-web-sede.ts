// Tienda web ▸ Conf. Tienda (ADR-0518): lo que el ERP guarda de cada tienda y la tienda online lee, en UN solo lugar para que las dos apps
// digan lo mismo. Hoy: el enlace del mapa. La base repite la regla en `ubicacion_datos_web_mapa_valido` (la que de verdad cierra).

/** Los enlaces de Google Maps que se aceptan, y nada más: el enlace se dibuja como un botón en la web del cliente, así que no puede ser
 *  cualquier dirección (ni un `javascript:`). Los de «Compartir» (`maps.app.goo.gl/…`), los largos de la barra (`google.com/maps/…`) y los
 *  viejos (`goo.gl/maps/…`, `maps.google.com/…`). Sin espacios. */
export const PATRON_ENLACE_MAPA = /^https:\/\/(www\.google\.com\/maps|google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)(\/\S*)?(\?\S*)?$/i;

/** El largo máximo, el mismo de la base. */
export const LARGO_MAXIMO_ENLACE_MAPA = 400;

/** ¿Es un enlace de mapa que la base aceptaría? Vacío no cuenta: «sin mapa» es `null`, no un enlace malo. */
export function enlaceMapaValido(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  const t = url.trim();
  return t.length > 0 && t.length <= LARGO_MAXIMO_ENLACE_MAPA && t === url && PATRON_ENLACE_MAPA.test(t);
}
