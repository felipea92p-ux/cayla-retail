"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "@cayla-retail/portada/heroe.css";
import "@cayla-retail/portada/lienzo.css";

/**
 * El escenario de la vista previa (ADR-0436): lo de adentro se dibuja a su ancho REAL —1280 px una computadora, 375 un celular— y se
 * achica entero para caber en su caja, como una captura. Así el héroe de la tienda (`@cayla-retail/portada`) se acomoda exactamente
 * como se acomodará para el cliente (cambia de forma a los 960 px de su contenedor, no de esta pantalla). `alto`: corta a esa altura (la
 * miniatura de la lista); sin él, la caja crece con lo de adentro.
 *
 * Hasta medir la caja (el primer instante), lo de adentro no se ve: así nunca se asoma a su tamaño real.
 */
export function Lienzo({ ancho, alto, etiqueta, children }: { ancho: number; alto?: number; etiqueta?: string; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState<{ escala: number; alto: number } | null>(null);

  useLayoutEffect(() => {
    const c = caja.current;
    const h = hoja.current;
    if (!c || !h) return;
    // El observador avisa apenas empieza a mirar (y después con cada cambio de ancho de la caja o de alto de la portada).
    const observador = new ResizeObserver(() => setMedida({ escala: c.clientWidth / ancho, alto: alto ?? h.offsetHeight }));
    observador.observe(c);
    observador.observe(h);
    return () => observador.disconnect();
  }, [ancho, alto]);

  return (
    <div
      ref={caja}
      className="tw-lienzo"
      data-color-dato
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      style={medida ? { height: medida.alto * medida.escala } : { aspectRatio: `${ancho} / ${alto ?? Math.round(ancho * 0.56)}` }}
    >
      <div
        ref={hoja}
        className="portada-lienzo tw-lienzo-hoja"
        style={{ width: ancho, height: alto, transform: medida ? `scale(${medida.escala})` : undefined, visibility: medida ? undefined : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
