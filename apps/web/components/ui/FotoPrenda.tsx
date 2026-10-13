"use client";

import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";

// Vivía en `components/apartados/piezas.tsx` (ADR-0168). Se mudó acá, sin cambiar su lógica, para que Producción (un Server Component) la use
// sin arrastrar al navegador el punto de venta que ese archivo importa (`money`). `apartados/piezas.tsx` la re-exporta: ningún otro archivo cambió.

/**
 * La foto de la prenda, servida al tamaño en que se VE. `ancho` es el ancho en pantalla (px CSS): el optimizador de
 * Next entrega un WebP de ese ancho (y el doble en pantallas retina), no el original. Medido el 2026-09-22 en
 * producción: 31 fotos, promedio 90 KB y la mayor 199 KB; una miniatura de 44 px pesa unos 5 KB. Sin esto, la lista
 * del buscador bajaba ~0,7 MB por búsqueda. Si no hay foto o no carga (404, host no permitido), queda el ícono de su
 * categoría sobre el color de la prenda (`MosaicoPrenda`, ADR-0333; antes el ícono sobre el tono de su familia, sin color):
 * nunca una imagen rota. Cómo se sirve la foto (optimizada o tal cual, según su host) y qué hacer si no carga lo decide
 * `ImagenDePrenda`, la misma pieza de `MiniaturaPrenda` y `TilePrenda` (ADR-0168, «Actualización 2026-10-13»).
 */
export function FotoPrenda({
  fotoUrl,
  referencia,
  ancho,
  colorHex,
  categoria,
  categoriaPrefijo,
  categoriaFamilia = null,
  className = "",
}: {
  fotoUrl: string | null | undefined;
  referencia: string;
  ancho: number;
  /** El color de la prenda (`#rrggbb`): es el fondo cuando no hay foto. Sin él, el tono de su familia. */
  colorHex?: string | null;
  /** Su nombre de categoría: se escribe bajo el ícono en las cajas grandes (≥ 64 px). */
  categoria?: string | null;
  /** Prefijo y familia de su categoría: dibujan su ícono cuando no hay foto (`IconoCategoria`, por prefijo). */
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  className?: string;
}) {
  // La capa absoluta es de este contenedor: el mosaico trae su propio `relative`.
  const sinFoto = (
    <div className="absolute inset-0">
      <MosaicoPrenda forma="relleno" conNombre={ancho >= 64} colorHex={colorHex} prefijo={categoriaPrefijo} familia={categoriaFamilia} categoria={categoria} className="h-full w-full !rounded-none" />
    </div>
  );
  return (
    <div className={`relative aspect-[4/5] shrink-0 overflow-hidden rounded-lg ${className}`}>
      {fotoUrl ? <ImagenDePrenda src={fotoUrl} alt={referencia} fill sizes={`${ancho}px`} className="bg-sand/40 object-cover" fallback={sinFoto} /> : sinFoto}
    </div>
  );
}
