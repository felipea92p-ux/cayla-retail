// La imagen propia de una insignia (Catálogo ▸ Insignias, ADR-0490): una imagen que quien la crea sube en lugar de elegir uno de los dibujos de la
// lista. El ERP la reduce a un WebP cuadrado de 256 px y 100 KB o menos y la sube al almacén público `retail-insignias`; la base guarda solo la RUTA
// dentro del almacén (`etiquetas.icono_imagen`) y cada app arma la dirección. Mismo camino que las imágenes de las campañas (`campana-imagen.ts`).
// Aquí vive lo que el ERP y la tienda tienen que saber igual: el almacén, los topes, cómo es una ruta válida y qué dibujo manda cuando hay varios.
//
// PROMETE: (1) `esRutaDeImagenDeInsignia`: la única forma de ruta que el ERP pudo haber subido (`insignias/<insignia>/<archivo>.webp`): nada de
//   direcciones completas, de `..` ni de otros almacenes. (2) `urlDeImagenDeInsignia`: la dirección pública, o null si no se sabe. (3)
//   `dibujoResuelto`: lo que se dibuja de una insignia —su imagen propia, el dibujo que se eligió o el de su nombre—, UNA regla para el ERP y la tienda.
// ASUME: que quien llama pasa lo que la base guardó; un dato raro nunca rompe: cae al dibujo del nombre.

import { dibujoDeInsignia, type DibujoDeInsignia } from "./insignias-visual";

export const BUCKET_DE_INSIGNIAS = "retail-insignias";

/** El lado del cuadrado a que se reduce la imagen (se ve a 18 px en la tienda y a 72 en el sello: 256 alcanza para pantallas de alta densidad) y lo
 *  que pesa a lo más ya reducida. El almacén lo exige también (`file_size_limit`, 20261023213000). */
export const LADO_IMAGEN_INSIGNIA = 256;
export const MAX_BYTES_IMAGEN_INSIGNIA = 100 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RUTA = new RegExp(`^insignias/(${UUID})/${UUID}\\.webp$`);

/** La ruta de una imagen nueva dentro del almacén: `insignias/<insignia>/<archivo>.webp`, siempre con un nombre que no existía (nunca se pisa). */
export const rutaDeImagenDeInsignia = (etiquetaId: string, archivoId: string): string => `insignias/${etiquetaId.toLowerCase()}/${archivoId.toLowerCase()}.webp`;

/** ¿Es una ruta que el ERP pudo haber subido? Lo único que se deja pasar: nada de otros almacenes, de `..` ni de direcciones completas. */
export const esRutaDeImagenDeInsignia = (v: unknown): v is string => typeof v === "string" && RUTA.test(v);

/** ¿La ruta está en la carpeta de ESTA insignia? Una insignia nunca apunta a la imagen de otra (la base lo exige con un CHECK). */
export const imagenEsDeLaInsignia = (ruta: unknown, etiquetaId: string): boolean => {
  const m = typeof ruta === "string" ? RUTA.exec(ruta) : null;
  return m !== null && m[1] === etiquetaId.toLowerCase();
};

/** La dirección pública de una imagen de insignia, o `null` si la ruta no es válida o no se sabe el origen del almacén. */
export function urlDeImagenDeInsignia(origen: string | null | undefined, ruta: unknown): string | null {
  if (!origen || !esRutaDeImagenDeInsignia(ruta)) return null;
  try {
    return `${new URL(origen).origin}/storage/v1/object/public/${BUCKET_DE_INSIGNIAS}/${ruta}`;
  } catch {
    return null;
  }
}

/** Lo que se dibuja de una insignia: su imagen propia (la ruta; `silueta`: es un molde que se pinta con el color del lugar, no una imagen a todo
 *  color), o un dibujo vectorial. */
export type DibujoResuelto = { tipo: "imagen"; ruta: string; silueta: boolean } | { tipo: "dibujo"; clave: DibujoDeInsignia };

/** Qué manda: la imagen propia si la tiene (y su ruta es válida); si no, el dibujo que se eligió de la lista; si no, el de su nombre; si no, la etiqueta. */
export function dibujoResuelto(i: { nombre: string; icono?: string | null; imagen?: string | null; silueta?: boolean | null }): DibujoResuelto {
  return esRutaDeImagenDeInsignia(i.imagen) ? { tipo: "imagen", ruta: i.imagen, silueta: i.silueta === true } : { tipo: "dibujo", clave: dibujoDeInsignia(i) };
}
