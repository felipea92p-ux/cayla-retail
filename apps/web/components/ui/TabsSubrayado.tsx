"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type ItemTab = { clave: string; etiqueta: ReactNode; conteo?: ReactNode; tono?: "ambar" };

/**
 * Pestañas de una sola pantalla (estado, no ruta) con el SUBRAYADO ROJO que se desliza de una a otra
 * (spike de Recibir, 2026-09-19), en vez de que el borde salte. Hermana de `SegmentoDeslizante` (allí el
 * pulgar es un fondo oscuro; acá, una línea bajo la pestaña). La primera vez se coloca sin transición: si no,
 * se vería viajar desde 0 al abrir la pantalla. `conteo` es un nodo para que pueda ser una cifra que cuenta.
 */
export function TabsSubrayado({
  items,
  valor,
  onCambio,
  etiqueta,
  className = "",
  clasePestana = "",
}: {
  items: ItemTab[];
  valor: string;
  onCambio: (clave: string) => void;
  etiqueta: string;
  className?: string;
  clasePestana?: string;
}) {
  const cont = useRef<HTMLDivElement>(null);
  const [linea, setLinea] = useState<{ x: number; y: number; w: number } | null>(null);
  const [listo, setListo] = useState(false);

  useLayoutEffect(() => {
    const activa = cont.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!activa) return;
    const medir = () => setLinea({ x: activa.offsetLeft, y: activa.offsetTop + activa.offsetHeight - 2, w: activa.offsetWidth });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(activa);
    return () => ro.disconnect();
  }, [valor, items.length]);
  // La línea aparece sin viajar la primera vez; desde ahí, sí se desliza.
  useLayoutEffect(() => {
    if (linea && !listo) requestAnimationFrame(() => setListo(true));
  }, [linea, listo]);

  return (
    <div ref={cont} className={`relative min-w-0 max-w-full ${className}`}>
      <div role="tablist" aria-label={etiqueta} className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map((t) => (
          <button
            key={t.clave}
            type="button"
            role="tab"
            aria-selected={valor === t.clave}
            onClick={() => onCambio(t.clave)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap transition-colors ${valor === t.clave ? "font-medium text-tinta" : "text-tinta/65 hover:text-rojo"} ${clasePestana}`}
          >
            {t.etiqueta}
            {t.conteo != null && (
              <span
                className={`rounded-md border px-1.5 text-[11px] font-semibold leading-[17px] tabular-nums transition-colors ${
                  t.tono === "ambar" ? "border-ambar/30 bg-ambar/10 text-ambar-profundo" : valor === t.clave ? "border-sand bg-sand text-tinta" : "border-tinta/10 bg-tinta/[0.04] text-tinta/65"
                }`}
              >
                {t.conteo}
              </span>
            )}
          </button>
        ))}
      </div>
      {linea && (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 h-0.5 bg-rojo ${listo ? "transition-[transform,width] duration-[340ms] ease-cayla" : ""}`}
          style={{ width: linea.w, transform: `translate(${linea.x}px, ${linea.y}px)` }}
        />
      )}
    </div>
  );
}
