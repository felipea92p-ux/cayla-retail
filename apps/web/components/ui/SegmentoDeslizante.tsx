"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type OpcionSegmento = { clave: string; etiqueta: ReactNode; conteo?: number };

/**
 * Segmentado con un «pulgar» que se DESLIZA hasta la opción elegida (ADR-0122), en vez de que el fondo
 * oscuro salte de una a otra: se ve de dónde viene el cambio. Es un `radiogroup` (misma semántica que el
 * filtro de rubro que ya había); en una pantalla angosta se desplaza en horizontal y el pulgar sigue a
 * la opción activa. La primera vez se coloca sin transición (si no, se vería viajar desde 0 al abrir la
 * pantalla, y esa entrada no responde a ninguna acción).
 */
export function SegmentoDeslizante({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className = "",
}: {
  opciones: OpcionSegmento[];
  valor: string;
  onCambio: (clave: string) => void;
  etiqueta: string;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [pulgar, setPulgar] = useState<{ x: number; w: number } | null>(null);
  const [listo, setListo] = useState(false);

  useLayoutEffect(() => {
    const cont = contenedor.current;
    const activo = cont?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!cont || !activo) return;
    const medir = () => setPulgar({ x: activo.offsetLeft, w: activo.offsetWidth });
    medir();
    activo.scrollIntoView({ block: "nearest", inline: "nearest" });
    const ro = new ResizeObserver(medir);
    ro.observe(activo);
    return () => ro.disconnect();
  }, [valor, opciones]);

  // Activa la transición DESPUÉS del primer pintado con pulgar colocado.
  useLayoutEffect(() => {
    if (!pulgar || listo) return;
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, [pulgar, listo]);

  return (
    <div ref={contenedor} role="radiogroup" aria-label={etiqueta} className={`relative inline-flex max-w-full overflow-x-auto rounded-lg border border-tinta/15 [scrollbar-width:none] ${className}`}>
      {pulgar && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 rounded-[7px] bg-tinta ${listo ? "transition-[transform,width] duration-[340ms] ease-cayla" : ""}`}
          style={{ width: pulgar.w, transform: `translateX(${pulgar.x}px)` }}
        />
      )}
      {opciones.map((o) => {
        const activa = o.clave === valor;
        return (
          <button
            key={o.clave || "todos"}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onCambio(o.clave)}
            className={`label-cayla relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-[11px] transition-colors duration-200 ${activa ? "text-crema" : "text-tinta/65 hover:text-rojo"}`}
          >
            {o.etiqueta}
            {o.conteo != null && <span className="ml-1 font-medium tracking-normal opacity-60">{o.conteo}</span>}
          </button>
        );
      })}
    </div>
  );
}
