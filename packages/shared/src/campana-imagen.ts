// La imagen propia de una campaña (Tienda web ▸ Campañas, modo «Mi propia imagen»): un banner horizontal para el computador y, si el líder la
// sube, una versión vertical para el celular. El ERP la reduce a WebP de 300 KB o menos y la sube al almacén público `retail-campanas`; la base
// guarda solo la RUTA dentro del almacén y la tienda arma la dirección. Aquí vive lo que las dos apps tienen que saber igual: el almacén, los
// topes, cómo es una ruta válida y los colores de una campaña con imagen.

import { colorDelSello, ratioContraste, textoSobre, type ColoresDeCampana, type ComprobacionDeLectura } from "./campanas-web";

export const BUCKET_DE_CAMPANAS = "retail-campanas";

/** Lo que pesa a lo más una imagen ya reducida, y los lados mayores con que se reduce (el banner a 2,5:1 y la vertical a 4:5). */
export const MAX_BYTES_IMAGEN_CAMPANA = 300 * 1024;
export const IMAGEN_CAMPANA = {
  horizontal: { ancho: 1600, alto: 640, proporcion: 2.5, etiqueta: "horizontal" },
  vertical: { ancho: 1080, alto: 1350, proporcion: 0.8, etiqueta: "vertical" },
} as const;
export type TipoDeImagenDeCampana = keyof typeof IMAGEN_CAMPANA;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA = new RegExp(`^campanas/${UUID}/${UUID}\\.(webp|jpg)$`);

/** La ruta de una imagen nueva dentro del almacén: `campanas/<campaña>/<archivo>.webp`, siempre con un nombre que no existía (nunca se pisa). */
export const rutaDeImagenDeCampana = (etiquetaId: string, archivoId: string, extension: "webp" | "jpg" = "webp"): string =>
  `campanas/${etiquetaId.toLowerCase()}/${archivoId.toLowerCase()}.${extension}`;

/** ¿Es una ruta que el ERP pudo haber subido? Lo único que la tienda deja pasar: nada de otros almacenes, de `..` ni de direcciones completas. */
export const esRutaDeImagenDeCampana = (v: unknown): v is string => typeof v === "string" && RUTA.test(v);

/** La dirección pública de una imagen de campaña, o `null` si la ruta no es válida o no se sabe el origen del almacén. */
export function urlDeImagenDeCampana(origen: string | null | undefined, ruta: unknown): string | null {
  if (!origen || !esRutaDeImagenDeCampana(ruta)) return null;
  try {
    return `${new URL(origen).origin}/storage/v1/object/public/${BUCKET_DE_CAMPANAS}/${ruta}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Colores de una campaña con imagen

/** El botón de fábrica de una campaña con imagen: el rojo cochinilla de la tienda. */
export const ACENTO_DE_FABRICA_CON_IMAGEN = "#9e1d32";

/** De una campaña con imagen solo se elige el color del botón «Ver la campaña». El fondo (de la franja y del sello) es grafito y el texto, marfil: lo
 *  demás sale de la imagen. */
export function coloresDeImagenDeCampana(acentoPropio: string | null | undefined): ColoresDeCampana {
  return { fondo: "#1c1c1a", texto: "#f6f3ee", acento: acentoPropio && /^#[0-9a-fA-F]{6}$/.test(acentoPropio) ? acentoPropio.toLowerCase() : ACENTO_DE_FABRICA_CON_IMAGEN };
}

/** El candado de lectura de una campaña con imagen: la letra del botón sobre su color (4,5:1; la letra se elige sola, así que casi siempre pasa) y el
 *  sello de descuento sobre la foto de la prenda (3:1; también se ajusta solo). */
export function comprobarLecturaDeImagen(c: ColoresDeCampana): { ok: boolean; items: ComprobacionDeLectura[] } {
  const sello = colorDelSello(c);
  const items: ComprobacionDeLectura[] = [
    { nombre: "Texto del botón sobre su color", ratio: ratioContraste(c.acento, textoSobre(c.acento)), minimo: 4.5 },
    { nombre: "Sello de descuento sobre la foto (se ajusta solo)", ratio: ratioContraste(sello.fondo, "#e1ded7"), minimo: 3 },
  ].map((x) => ({ ...x, ok: x.ratio >= x.minimo }));
  return { ok: items.every((x) => x.ok), items };
}
