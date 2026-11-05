// Preparar la imagen propia de una campaña en el navegador (Tienda web ▸ Campañas, modo «Mi propia imagen»). Lógica pura: lo que depende del
// navegador (leer el archivo, dibujarlo, comprimirlo, subirlo) vive en `imagen-de-campana.ts`. Se prueba con `imagen-de-campana-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: decir si un archivo elegido sirve (tipo y peso de entrada), a qué medidas se reduce (sin agrandar nunca ni deformar), qué avisar si
//            la proporción no es la recomendada y cuál es el mejor intento que cabe en el tope de peso.
//   ASUME:   que el almacén (`retail-campanas`) y sus topes son los de `@cayla-retail/shared`.
//   NO HACE: tocar el archivo ni la red.

import { IMAGEN_CAMPANA, MAX_BYTES_IMAGEN_CAMPANA, type TipoDeImagenDeCampana } from "@cayla-retail/shared";

/** Lo más que se acepta de ENTRADA (la foto de un celular pesa varios MB; se reduce antes de subirla). */
export const MAX_BYTES_DE_ENTRADA = 15 * 1024 * 1024;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];

/** Por qué no sirve el archivo elegido (o `null` si sirve). */
export function objecionImagenElegida(archivo: { type: string; size: number }): string | null {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) return "Sube una imagen JPG, PNG o WebP.";
  if (archivo.size === 0) return "Ese archivo está vacío.";
  if (archivo.size > MAX_BYTES_DE_ENTRADA) return "Esa imagen pesa más de 15 MB. Prueba con una más liviana.";
  return null;
}

/** A qué medidas se reduce: el lado que más se pasa de lo recomendado manda, sin agrandar nunca y sin deformar. */
export function medidasReducidas(ancho: number, alto: number, tipo: TipoDeImagenDeCampana): { ancho: number; alto: number } {
  const max = IMAGEN_CAMPANA[tipo];
  const escala = Math.min(1, max.ancho / ancho, max.alto / alto);
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Un aviso (nunca un bloqueo) si la proporción se aparta de la recomendada: la imagen se recorta al llenar el cuadro y puede perder lo de los bordes. */
export function avisoDeProporcion(ancho: number, alto: number, tipo: TipoDeImagenDeCampana): string | null {
  const real = ancho / alto;
  const ideal = IMAGEN_CAMPANA[tipo].proporcion;
  if (Math.abs(real - ideal) / ideal <= 0.25) return null;
  const medida = tipo === "horizontal" ? "1600 × 640 (2,5 a 1)" : "1080 × 1350 (4 a 5)";
  return `La medida recomendada es ${medida}. Con la tuya, la tienda recorta los bordes: deja lo importante al centro.`;
}

/** Los intentos de compresión, del mejor al más liviano: calidad que baja y, si aún no cabe, medidas que bajan. Cada uno es [calidad, escala]. */
export const INTENTOS_DE_COMPRESION: readonly (readonly [number, number])[] = [
  [0.86, 1], [0.78, 1], [0.7, 1], [0.6, 1], [0.7, 0.8], [0.6, 0.8], [0.6, 0.65], [0.5, 0.5],
];
