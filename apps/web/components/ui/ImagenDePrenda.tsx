"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { fondoDeLaFoto, fotoOptimizable } from "@/lib/foto-prenda-reglas";

/**
 * La `<Image>` de una foto de prenda, con las dos decisiones que toda foto de prenda necesita y que antes cada pieza tomaba (o
 * no) por su cuenta (ADR-0168, «Actualización 2026-10-13»):
 *
 * 1. **¿La sirve el optimizador de Next o se muestra tal cual?** Si vive en NUESTRO Storage público (`fotoOptimizable`), Next
 *    entrega un WebP del ancho en que se dibuja (~5 KB para una miniatura) en vez del original de 1200×1500 (~90 KB). Una foto de
 *    otro host se muestra sin optimizar: el optimizador la rechazaría y tumbaría la pantalla (ver `lib/foto-prenda-reglas.ts`).
 * 2. **¿Y si no carga?** (404, host que no responde) en vez de una imagen rota se dibuja `fallback`: la prenda sin foto de siempre
 *    (`SinFoto` / `MosaicoPrenda`, ADR-0333). El «rota» se guarda POR URL: si la lista re-dibuja esa misma celda con otra foto,
 *    la nueva se intenta, no hereda el fallo de la anterior.
 *
 * 3. **¿Qué hay detrás?** El color de la prenda (`fondo`) solo MIENTRAS llega la foto; al cargar se quita (`fondoDeLaFoto`). Desde el
 *    ADR-0442 la foto es un PNG transparente: si el color se quedara, la prenda se vería sobre su propio color de catálogo (la «Blusa
 *    Burdeos de Rayas» sobre chocolate, 2026-10-18). Lo que se ve detrás de una foto transparente es el fondo de su tarjeta.
 *
 * Quien la use decide la caja (`width`/`height` o `fill`), el recorte y el `fallback`; esta pieza solo decide cómo se sirve.
 * No es `FotoDePrenda` (la foto grande del costado de una hoja): aquella dibuja SU caja; esta es solo el `<img>`.
 */
export function ImagenDePrenda({
  src,
  alt,
  fallback,
  alFallar,
  fondo,
  ...resto
}: Omit<ImageProps, "src" | "unoptimized" | "onError" | "onLoad"> & {
  src: string;
  /** Lo que se dibuja si la foto no carga: la prenda sin foto de su pantalla. `null` si la caja ya se ve bien vacía (tiene su fondo). */
  fallback: ReactNode;
  /** Se llama una vez cuando la foto no carga: para quien además de dibujar el fallback debe sacarla de una lista (`TrasladoMiniaturas`). */
  alFallar?: () => void;
  /** El color de la prenda (`#rrggbb`): es lo que se ve MIENTRAS llega la foto (en vez de una caja vacía); al cargar se quita. Es dato, no tema: no cambia en oscuro. */
  fondo?: string | null;
}) {
  const [rota, setRota] = useState<string | null>(null);
  // Cargada POR URL, como «rota»: si la celda cambia de foto, la nueva vuelve a mostrar el color mientras llega.
  const [cargada, setCargada] = useState<string | null>(null);
  if (rota === src) return <>{fallback}</>;
  const color = fondoDeLaFoto(fondo, cargada === src);
  return <Image {...resto} style={color ? { backgroundColor: color, ...resto.style } : resto.style} src={src} alt={alt} unoptimized={!fotoOptimizable(src, process.env.NEXT_PUBLIC_SUPABASE_URL)} onLoad={() => setCargada(src)} onError={() => {
    setRota(src);
    alFallar?.();
  }} />;
}
