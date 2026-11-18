import sharp from "sharp";
import { ANCHO_PARA_MEDIR, type MedidaDelRecorte, medirRecorte } from "./union-prendas";

// La medida de un recorte para la unión del probador, sacada en el servidor (ADR-0449, act. 2026-11-10): la usa `app/api/medida/[archivo]/route.ts`.
// Es la misma `medirRecorte` que antes corría en el navegador, sobre los píxeles que entrega `sharp` en vez de un lienzo: Safari 26 le mete ruido
// a la lectura de un lienzo, y aquí no hay lienzo. Solo en el servidor (usa `sharp`).

/** Lo más que se acepta bajar: una foto de prenda pesa menos de 1 MB. */
export const TOPE_DE_BYTES_DEL_RECORTE = 15 * 1024 * 1024;

/** Mide un recorte (los bytes del PNG o WebP tal como está en el almacén), bajado a `ANCHO_PARA_MEDIR` de ancho. Lanza si la imagen no se puede leer. */
export async function medirBytesDelRecorte(bytes: Buffer): Promise<MedidaDelRecorte> {
  const { data, info } = await sharp(bytes)
    .resize({ width: ANCHO_PARA_MEDIR, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return medirRecorte(data, info.width, info.height);
}
