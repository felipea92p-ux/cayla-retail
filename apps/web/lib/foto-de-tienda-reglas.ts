// Preparar la foto de la fachada de una tienda en el navegador (Tienda web ▸ Conf. Tienda). Lógica pura: lo que depende del navegador (leer el
// archivo, dibujarlo, comprimirlo, subirlo) vive en `foto-de-tienda.ts`. Mismo camino que la imagen de una campaña (`imagen-de-campana*.ts`).
//
// CONTRATO
//   PROMETE: a qué medidas se reduce una foto (sin agrandar nunca ni deformar) y cuál es el mejor intento que cabe en el tope de peso.
//   ASUME:   que el almacén (`retail-tiendas`) y sus topes son los de `@cayla-retail/shared/tienda-web-sede`.
//   NO HACE: tocar el archivo ni la red.

import { FOTO_TIENDA } from "@cayla-retail/shared/tienda-web-sede";

/** A qué medidas se reduce: el lado que más se pasa de lo recomendado manda, sin agrandar nunca y sin deformar. */
export function medidasDeFachada(ancho: number, alto: number): { ancho: number; alto: number } {
  const escala = Math.min(1, FOTO_TIENDA.ancho / ancho, FOTO_TIENDA.alto / alto);
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Un aviso (nunca un bloqueo) si la foto es muy vertical: la tarjeta la muestra horizontal y recorta arriba y abajo. */
export function avisoDeFachada(ancho: number, alto: number): string | null {
  if (ancho / alto >= 1.1) return null;
  return "La tarjeta muestra la foto horizontal: se recorta arriba y abajo. Prueba con una foto más ancha, con la fachada al centro.";
}
