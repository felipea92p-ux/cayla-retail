// El aviso que cruza de una página a otra (ADR-0512, actividad 4): al tocar un grupo o una categoría con color o talla elegidos, lo que allá no
// existe se suelta (ya lo escribió el servidor en el enlace, con su frase: `data-quita`), y quien llega tiene que enterarse: «En Pantalones no
// hay talla M: la quitamos», con «Deshacer» que vuelve a la lista de antes. La lista nueva llega por otra página, así que el aviso viaja por
// el almacén de la pestaña (`sessionStorage`): lo escribe el toque y lo recoge la página de llegada, una sola vez. Sin almacén (una ventana
// privada, el almacenamiento bloqueado) el aviso no cruza y nada más se pierde: la lista nueva se ve igual.

export const CLAVE_AVISO = "cayla-filtros-aviso";

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `destino`: la dirección a la que lleva el toque; `volver`: la de la lista de la que se sale (la que tenía todo lo elegido). */
export type AvisoQueCruza = { texto: string; destino: string; volver: string };

export function guardarAviso(almacen: Almacen, aviso: AvisoQueCruza): void {
  try {
    almacen.setItem(CLAVE_AVISO, JSON.stringify(aviso));
  } catch {
    // Sin almacén: el aviso no cruza.
  }
}

/**
 * Recoge el aviso que dejó el toque (y lo borra: se ve una sola vez). Solo vale si se llegó adonde llevaba (`aqui`: la dirección de ahora): si
 * la persona se fue a otra parte, el aviso ya no habla de lo que se ve. Lo que no se puede leer (otra versión, un valor raro) se descarta.
 */
export function tomarAviso(almacen: Almacen, aqui: string): { texto: string; volver: string } | null {
  try {
    const crudo = almacen.getItem(CLAVE_AVISO);
    if (crudo === null) return null;
    almacen.removeItem(CLAVE_AVISO);
    const a = JSON.parse(crudo) as Partial<AvisoQueCruza> | null;
    if (!a || typeof a.texto !== "string" || typeof a.destino !== "string" || typeof a.volver !== "string") return null;
    if (a.texto.length === 0 || a.texto.length > 240 || !a.volver.startsWith("/catalogo") || a.destino !== aqui) return null;
    return { texto: a.texto, volver: a.volver };
  } catch {
    return null;
  }
}
