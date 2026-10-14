"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { fotoOptimizable } from "@/lib/foto-prenda-reglas";

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
 * Quien la use decide la caja (`width`/`height` o `fill`), el recorte y el `fallback`; esta pieza solo decide cómo se sirve.
 * No es `FotoDePrenda` (la foto grande del costado de una hoja): aquella dibuja SU caja; esta es solo el `<img>`.
 */
export function ImagenDePrenda({
  src,
  alt,
  fallback,
  ...resto
}: Omit<ImageProps, "src" | "unoptimized" | "onError"> & {
  src: string;
  /** Lo que se dibuja si la foto no carga: la prenda sin foto de su pantalla. */
  fallback: ReactNode;
}) {
  const [rota, setRota] = useState<string | null>(null);
  if (rota === src) return <>{fallback}</>;
  return <Image {...resto} src={src} alt={alt} unoptimized={!fotoOptimizable(src, process.env.NEXT_PUBLIC_SUPABASE_URL)} onError={() => setRota(src)} />;
}
