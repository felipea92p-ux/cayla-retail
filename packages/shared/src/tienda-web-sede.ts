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

// ---------------------------------------------------------------- La foto de la fachada

/** El almacén público donde el ERP sube la foto de cada tienda (migración 20261026162000). Solo se sube: cada foto nueva lleva un nombre nuevo. */
export const BUCKET_DE_TIENDAS = "retail-tiendas";

/** Lo que pesa a lo más una foto ya reducida (WebP) y el lado mayor con que se reduce. La tarjeta la muestra horizontal y recortada al centro. */
export const MAX_BYTES_FOTO_TIENDA = 200 * 1024;
export const FOTO_TIENDA = { ancho: 1200, alto: 800 } as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** La ruta de una foto nueva dentro del almacén: `tiendas/<tienda>/<archivo>.webp`, siempre con un nombre que no existía (nunca se pisa). */
export const rutaDeFotoDeTienda = (tiendaId: string, archivoId: string, extension: "webp" | "jpg" = "webp"): string =>
  `tiendas/${tiendaId.toLowerCase()}/${archivoId.toLowerCase()}.${extension}`;

/** ¿Es una ruta que el ERP pudo haber subido (y, con `tiendaId`, a la carpeta de ESA tienda)? Lo único que la tienda deja pasar: nada de otros
 *  almacenes, de `..` ni de direcciones completas. La base repite la regla (`ubicacion_datos_web_foto_valida`). */
export function esRutaDeFotoDeTienda(v: unknown, tiendaId?: string): v is string {
  if (typeof v !== "string") return false;
  const patron = tiendaId ? new RegExp(`^tiendas/${tiendaId.toLowerCase()}/${UUID}\\.(webp|jpg)$`) : new RegExp(`^tiendas/${UUID}/${UUID}\\.(webp|jpg)$`);
  return patron.test(v);
}

/** La dirección pública de la foto de una tienda, o `null` si la ruta no es válida o no se sabe el origen del almacén. */
export function urlDeFotoDeTienda(origen: string | null | undefined, ruta: unknown): string | null {
  if (!origen || !esRutaDeFotoDeTienda(ruta)) return null;
  try {
    return `${new URL(origen).origin}/storage/v1/object/public/${BUCKET_DE_TIENDAS}/${ruta}`;
  } catch {
    return null;
  }
}
