// Preparar la imagen propia de una insignia en el navegador (Catálogo ▸ Insignias, ADR-0490). Lógica pura: lo que depende del navegador (leer el
// archivo, dibujarlo, comprimirlo, subirlo) vive en `imagen-de-insignia.ts`. Mismo camino que las imágenes de las campañas
// (`imagen-de-campana-reglas.ts`), con un cuadrado en vez de un banner. Se prueba con `imagen-de-insignia-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: decir si un archivo elegido sirve (tipo y peso de entrada), a qué medidas se reduce (cabe entero en el cuadrado, sin agrandar nunca ni
//            deformar ni recortar) y cuál es el orden de intentos de compresión.
//   ASUME:   que el almacén (`retail-insignias`) y sus topes son los de `@cayla-retail/shared/insignia-imagen`.
//   NO HACE: tocar el archivo ni la red.

import { LADO_IMAGEN_INSIGNIA } from "@cayla-retail/shared/insignia-imagen";

/** Lo más que se acepta de ENTRADA (la foto de un celular pesa varios MB; se reduce antes de subirla). */
export const MAX_BYTES_DE_ENTRADA_INSIGNIA = 15 * 1024 * 1024;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];

/** El `accept` del selector de archivos. Sin SVG a propósito: un SVG puede traer código y no se adapta al tema. */
export const ACEPTA_IMAGEN_DE_INSIGNIA = TIPOS_ACEPTADOS.join(",");

/** Por qué no sirve el archivo elegido (o `null` si sirve). */
export function objecionImagenDeInsignia(archivo: { type: string; size: number }): string | null {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) return "Sube una imagen PNG, JPG o WebP.";
  if (archivo.size === 0) return "Ese archivo está vacío.";
  if (archivo.size > MAX_BYTES_DE_ENTRADA_INSIGNIA) return "Esa imagen pesa más de 15 MB. Prueba con una más liviana.";
  return null;
}

/** A qué medidas se dibuja DENTRO del cuadrado: entera (nada se recorta), centrada, sin deformar y sin agrandar una imagen que ya es más chica. */
export function medidasEnElCuadrado(ancho: number, alto: number, lado = LADO_IMAGEN_INSIGNIA): { ancho: number; alto: number; x: number; y: number } {
  const escala = Math.min(1, lado / ancho, lado / alto);
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  return { ancho: w, alto: h, x: Math.round((lado - w) / 2), y: Math.round((lado - h) / 2) };
}

/** Los intentos de compresión, del mejor al más liviano: calidad que baja y, si aún no cabe, el lado del cuadrado que baja. Cada uno es [calidad, escala]. */
export const INTENTOS_DE_COMPRESION_INSIGNIA: readonly (readonly [number, number])[] = [
  [0.9, 1], [0.82, 1], [0.72, 1], [0.6, 1], [0.7, 0.75], [0.6, 0.75], [0.6, 0.5],
];

/** Un aviso (nunca un bloqueo) si la imagen no es cuadrada: se dibuja entera y deja un margen transparente, no se recorta. */
export function avisoDeProporcionInsignia(ancho: number, alto: number): string | null {
  const real = ancho / alto;
  if (real >= 0.8 && real <= 1.25) return null;
  return "No es cuadrada: se verá entera, con un margen transparente a los lados.";
}
