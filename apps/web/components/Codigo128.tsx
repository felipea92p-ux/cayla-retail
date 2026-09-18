"use client";

import { useMemo } from "react";
import { barrasCode128, medir, MODULO_MM, ANCHO_UTIL_MM } from "@/lib/codigo128";

/**
 * Pinta un Code 128 B a TAMAÑO FÍSICO FIJO. El cálculo vive en `lib/codigo128.ts`.
 *
 * El ancho sale de los módulos (`módulos × moduloMm`), no del contenedor. Estirarlo
 * para llenar la etiqueta —como se hacía hasta el 2026-09-09— hace que 189 y 475
 * módulos ocupen lo mismo y destruye la proporción de anchos de la que depende el
 * lector. Ver el comentario largo en `lib/codigo128.ts`.
 *
 * Si el código no entra, NO se dibuja encogido: se avisa. Una etiqueta ilegible que
 * sale de la impresora igual es peor que una que no sale.
 */
export function Codigo128({
  texto,
  alto = 44,
  moduloMm = MODULO_MM,
  anchoUtilMm = ANCHO_UTIL_MM,
}: {
  texto: string;
  alto?: number;
  moduloMm?: number;
  anchoUtilMm?: number;
}) {
  const barras = useMemo(() => barrasCode128(texto), [texto]);

  if (!barras) return <p className="text-[8px] text-rojo">Código con caracteres no imprimibles</p>;

  const m = medir(barras.total, { moduloMm, anchoUtilMm });

  if (!m.cabe) {
    return (
      <p className="text-[8px] leading-tight text-rojo">
        «{texto}» necesita {m.anchoMm.toFixed(0)} mm y la etiqueta tiene {anchoUtilMm} mm.
        Un código de hasta {m.maxCaracteres} caracteres entra; éste tiene {texto.length}.
      </p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${barras.total} 1`}
      preserveAspectRatio="none"
      style={{ width: `${m.anchoMm}mm`, height: alto }}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código de barras ${texto}`}
    >
      <path d={barras.d} fill="#000" />
    </svg>
  );
}
