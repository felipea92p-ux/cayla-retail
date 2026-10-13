"use client";

import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";

/** La casilla del ERP (ADR-0358, ronda 6: Felipe la eligió tocándola el 2026-10-13): cuadrito de 20 px con esquinas de 6 y, al
 *  marcarla, el fondo de tinta CRECE desde el centro y el ✓ se DIBUJA (a medias, un guion que se traza). Es un
 *  `<input type="checkbox">` de verdad —teclado, lector de pantalla y formularios siguen igual—; solo cambia cómo se ve. El foco es
 *  el anillo común (ADR-0351). `onClick` no sube: la fila entera abre el cajón, la casilla no. Estilos: `app/estilos/campos-y-casillas.css`. */
export function Casilla({
  marcada,
  aMedias = false,
  onCambio,
  etiqueta,
  disabled = false,
  className = "",
}: {
  marcada: boolean;
  aMedias?: boolean;
  onCambio: () => void;
  etiqueta: string;
  /** No se puede marcar (la prenda no es devolvible): se ve atenuada y no responde. */
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = aMedias;
  }, [aMedias]);
  return (
    <span className={`casilla ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={marcada}
        disabled={disabled}
        onChange={onCambio}
        onClick={(e) => e.stopPropagation()}
        aria-label={etiqueta}
        className="casilla-input"
      />
      <span aria-hidden className="casilla-fondo" />
      <Check aria-hidden strokeWidth={3} className="casilla-marca casilla-visto" />
      <Minus aria-hidden strokeWidth={3} className="casilla-marca casilla-medio" />
    </span>
  );
}
