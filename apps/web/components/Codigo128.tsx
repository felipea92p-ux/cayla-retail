"use client";

import { useMemo } from "react";
import { barrasCode128 } from "@/lib/codigo128";

/**
 * Pinta un Code 128 B. Todo el cálculo vive en `lib/codigo128.ts` — acá solo se
 * dibuja, para que la hoja de prueba impresa mida exactamente lo mismo que la app.
 */
export function Codigo128({ texto, alto = 44 }: { texto: string; alto?: number }) {
  const barras = useMemo(() => barrasCode128(texto), [texto]);

  if (!barras) return <p className="text-[8px] text-rojo">Código con caracteres no imprimibles</p>;

  return (
    <svg
      viewBox={`0 0 ${barras.total} 1`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: alto }}
      shapeRendering="crispEdges"
    >
      <path d={barras.d} fill="#000" />
    </svg>
  );
}
