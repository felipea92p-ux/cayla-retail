/**
 * Reglas del «¿Salir sin guardar?» (ADR-0256). Puras: la parte de la pantalla que toca el navegador vive en
 * `components/AvisoDeSalida.tsx`; aquí solo está lo que se puede probar sin navegador.
 *
 * QUÉ CUBRE EL AVISO, y por qué hace falta cada cosa:
 *  · un enlace de la pantalla (el menú, «← Productos», el logo): Next navega sin recargar y el navegador no avisa;
 *  · el botón Atrás: idem, y es lo que más se usa en la tablet de la tienda;
 *  · cerrar o recargar la pestaña: el navegador ya tiene su propio aviso, que solo hay que pedirle.
 * Un enlace que abre otra pestaña, una descarga o un sitio de afuera NO se pregunta: la pantalla no se cierra (o el navegador
 * ya avisa por su cuenta al irse del sitio).
 */

/** Dónde está la pantalla ahora (lo que da `window.location`). */
export type UbicacionActual = { origin: string; pathname: string; search: string };

/** Lo que el aviso necesita saber de un clic sobre un enlace, sin depender del DOM. */
export type ClicEnEnlace = {
  href: string;
  /** El atributo `target` del enlace (`_blank`…). */
  target: string | null;
  descarga: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/**
 * ¿Este clic saca de la pantalla? Devuelve la ruta interna a la que iría (`/productos?x=1`), o `null` si no la deja:
 * clic con otro botón o con Ctrl/Cmd/Shift/Alt (abre otra pestaña o ventana y esta se queda), descarga, `target` distinto de
 * la misma pestaña, `mailto:`/`tel:`, otro sitio, o la misma pantalla (solo cambia el `#ancla`).
 */
export function destinoQueSale(clic: ClicEnEnlace, ubicacion: UbicacionActual): string | null {
  if (clic.defaultPrevented) return null;
  if (clic.button !== 0) return null;
  if (clic.metaKey || clic.ctrlKey || clic.shiftKey || clic.altKey) return null;
  if (clic.descarga) return null;
  if (clic.target && clic.target !== "_self") return null;

  let url: URL;
  try {
    url = new URL(clic.href, `${ubicacion.origin}${ubicacion.pathname}${ubicacion.search}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== ubicacion.origin) return null;
  if (url.pathname === ubicacion.pathname && url.search === ubicacion.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Lo que dice la ventana. Neutro en género: sirve para cualquier prenda o pantalla. */
export function textoDeSalida(cantidad: number, nombre: string): { titulo: string; bajada: string } {
  const cuantos = cantidad === 1 ? "1 cambio sin guardar" : `${cantidad} cambios sin guardar`;
  return { titulo: "¿Salir sin guardar?", bajada: `Tienes ${cuantos} en «${nombre}». Si sales ahora, se pierden.` };
}
