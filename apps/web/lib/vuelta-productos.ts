// La vuelta a la pantalla de Productos desde las pantallas a las que se sale de ella (Editar, Historial, Etiquetas).
//
// Productos tiene dos vistas (Grilla y Tabla) y filtros que viven en la URL (`/productos?vista=tabla&q=polo`). Un enlace
// fijo «← Productos» tira todo eso y deja a la persona en la Grilla sin filtros. Quien sale lleva su pantalla exacta en
// `?desde=`, y la pantalla de destino vuelve a ella. Lógica pura, sin React, para poder probarla.

/** La pantalla de vuelta que viene por la URL (`?desde=`): cualquiera puede escribirla, así que solo pasa una ruta
 *  interna de Productos (`/productos`, con o sin filtros). Nunca otro sitio, ni `//host`, ni `javascript:`. */
export function desdeSeguro(desde: string | null | undefined): string | null {
  if (!desde || desde.length > 500) return null;
  if (!/^\/productos(\?[^\s\\]*)?$/.test(desde)) return null;
  return desde;
}

/** Le agrega a un enlace la pantalla de origen (`?desde=`), si es una de Productos. Si no, el enlace queda como venía. */
export function conDesde(url: string, desde: string | null | undefined): string {
  const seguro = desdeSeguro(desde);
  if (!seguro) return url;
  return `${url}${url.includes("?") ? "&" : "?"}desde=${encodeURIComponent(seguro)}`;
}

/** Adónde vuelve una pantalla que salió de Productos: a la vista exacta de donde se salió, o a `/productos` a secas. */
export function vueltaAProductos(desde: string | null | undefined): string {
  return desdeSeguro(desde) ?? "/productos";
}

/** `?desde=` tal como llega de `searchParams` (puede venir repetido). */
export function desdeDeParams(desde: string | string[] | undefined): string | null {
  return desdeSeguro(Array.isArray(desde) ? desde[0] : desde);
}
