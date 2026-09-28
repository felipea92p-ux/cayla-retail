"use client";

import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";

/** La casilla de las listas de Existencias (diseño aprobado, 2026-09-28): cuadrito de 18 px con el borde fino y, marcada, relleno
 *  de tinta con su ✓ (a medias, con un guion). Es un `<input type="checkbox">` de verdad —teclado, lector de pantalla y
 *  formularios siguen igual—; solo cambia cómo se ve. `onClick` no sube: la fila entera abre el cajón, la casilla no. */
export function Casilla({
  marcada,
  aMedias = false,
  onCambio,
  etiqueta,
  className = "",
}: {
  marcada: boolean;
  aMedias?: boolean;
  onCambio: () => void;
  etiqueta: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = aMedias;
  }, [aMedias]);
  return (
    <span className={`relative inline-flex h-[18px] w-[18px] shrink-0 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={marcada}
        onChange={onCambio}
        onClick={(e) => e.stopPropagation()}
        aria-label={etiqueta}
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[5px] border border-tinta/30 bg-papel transition-colors checked:border-tinta checked:bg-tinta indeterminate:border-tinta indeterminate:bg-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo"
      />
      <Check aria-hidden strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-crema opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0" />
      <Minus aria-hidden strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-crema opacity-0 peer-indeterminate:opacity-100" />
    </span>
  );
}
