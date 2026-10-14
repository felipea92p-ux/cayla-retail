"use client";

import { getImageProps } from "next/image";
import { fotoOptimizable } from "@/lib/foto-prenda-reglas";
import { cargarFoto, MS_ESPERA_MAX } from "@/lib/precargar-fotos";

/**
 * Baja de antemano las fotos de una prenda en el tamaño en que `ImagenDePrenda` las va a dibujar (`sizes`, con `fill`): la versión chica
 * del optimizador, no el original. Pide exactamente lo que `<Image>` pediría (`getImageProps` arma el mismo `srcset`), así que al
 * dibujarla el navegador ya la tiene. Una foto que el optimizador no sirve (otro host) se precarga tal cual, como se dibuja.
 * Vive aparte de `lib/precargar-fotos.ts` porque trae `next/image` (el resto de esa pieza no lo necesita y se prueba sin él).
 */
export function precargarMiniaturas(urls: readonly (string | null | undefined)[], sizes: string): void {
  for (const url of new Set(urls)) if (url) void cargarMiniatura(url, sizes);
}

function cargarMiniatura(url: string, sizes: string): Promise<boolean> {
  if (!fotoOptimizable(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) return cargarFoto(url);
  const { props } = getImageProps({ src: url, alt: "", fill: true, sizes });
  return cargarFoto(url, undefined, { src: props.src, srcSet: props.srcSet, sizes: props.sizes });
}

/** Espera la foto en ese tamaño, pero no más de `maxMs`: lo que se muestra después no depende de que la red responda. */
export function esperarMiniatura(url: string, sizes: string, maxMs: number = MS_ESPERA_MAX): Promise<void> {
  return Promise.race([cargarMiniatura(url, sizes).then(() => undefined), new Promise<void>((resolver) => setTimeout(resolver, maxMs))]);
}

/** Lo mismo para una foto de ancho y alto FIJOS (sin `fill`): `<Image width height>` pide la versión de 1x y la de 2x, y el navegador toma la de su pantalla. */
export function precargarFotoFija(url: string | null | undefined, width: number, height: number): void {
  if (!url) return;
  if (!fotoOptimizable(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    void cargarFoto(url);
    return;
  }
  const { props } = getImageProps({ src: url, alt: "", width, height });
  void cargarFoto(url, undefined, { src: props.src, srcSet: props.srcSet });
}
