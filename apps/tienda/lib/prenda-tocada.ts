// Lo que ya se vio de una prenda en la tarjeta que se tocó (2026-10-17, Felipe: «quisiera que el esqueleto sea más fiel a lo que mostrará
// el contenido»): su foto, su nombre, su precio y su categoría. Mientras llega la ficha, su esqueleto no inventa nada: muestra eso mismo
// en el lugar donde la ficha lo va a mostrar, y solo brilla lo que de verdad falta (los colores, las tallas, el botón). La tarjeta lo
// lleva escrito en sus `data-*` (`TarjetaPrenda`, las polaroids del Inicio) y la foto es la que el navegador ya tiene descargada.
// Lógica pura, con su prueba al lado.

export type PrendaTocada = {
  id: string;
  nombre: string;
  /** El precio que dice la tarjeta («S/ 61.50»), tal cual. */
  precio: string | null;
  /** El de antes, tachado, si la tarjeta lo tachaba. */
  antes: string | null;
  oferta: boolean;
  categoria: string | null;
  /** La foto que el navegador ya descargó para la tarjeta (`currentSrc`): se ve al instante. */
  foto: string | null;
  /** La misma foto sin el optimizador (`/_next/image?url=…`): con ella la ficha sabe si su primera foto es esta. */
  original: string | null;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La dirección de la foto original detrás del optimizador de Next (`/_next/image?url=<foto>&w=640&q=75`); si no pasó por él, la misma. */
export function fotoOriginal(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, "http://local");
    if (url.pathname === "/_next/image") return url.searchParams.get("url");
    return src;
  } catch {
    return null;
  }
}

const texto = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Lo que dice una tarjeta en sus `data-*` (el `dataset` de la caja con `data-prenda`) más su foto ya descargada. Sin id válido o sin
 *  nombre no hay nada que mostrar: null. */
export function leerPrendaTocada(datos: Record<string, string | undefined>, foto: string | null): PrendaTocada | null {
  const id = texto(datos.prenda);
  const nombre = texto(datos.nombre);
  if (!id || !ID.test(id) || !nombre) return null;
  return {
    id: id.toLowerCase(),
    nombre,
    precio: texto(datos.precio),
    antes: texto(datos.antes),
    oferta: datos.oferta === "si",
    categoria: texto(datos.categoria),
    foto,
    original: fotoOriginal(foto),
  };
}

/** ¿La primera foto de la ficha es la que se vio en la tarjeta? Solo entonces se muestra debajo mientras llega la grande: otra foto (otro
 *  color, otro orden) haría que la ficha mostrara un instante algo que no es. */
export function esLaMismaFoto(tocada: PrendaTocada | null, primeraDeLaFicha: string | null): boolean {
  return Boolean(tocada?.foto && tocada.original && primeraDeLaFicha && tocada.original === primeraDeLaFicha);
}
