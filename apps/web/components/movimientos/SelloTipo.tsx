"use client";

import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAlVerse } from "@/components/movimientos/useAlVerse";
import { TIPOS_VISUALES, type TipoVisual } from "@/lib/movimientos-tipos";

// El sello de un tipo de movimiento (ADR-0346): un cuadrado suave del color del tipo con su ícono, que se mueve UNA vez
// cuando entra a la vista y otra cada vez que se pasa el mouse por su fila. Los estilos y los movimientos viven en
// `app/estilos/movimientos-sellos.css`; acá solo están los dibujos y el momento de arrancar.
//
// Los íconos tienen piezas con nombre (`mv-bolsa`, `mv-perchero`…) para que el CSS anime cada una por separado.

const GLIFOS: Record<TipoVisual, ReactNode> = {
  venta: (
    <>
      <g className="mv-bolsa">
        <path d="M5.2 8.5h13.6l-1 11.5H6.2L5.2 8.5Z" />
      </g>
      <path className="mv-asa" d="M9 8.5V7.4a3 3 0 0 1 6 0v1.1" />
    </>
  ),
  colgada: (
    <>
      <path d="M3.5 3.6h17" />
      <g className="mv-perchero">
        <path d="M12 3.6v2.6a2.3 2.3 0 1 1-2.3 2.3" />
        <path d="M12 10.6 3.9 16.3a1.2 1.2 0 0 0 .7 2.2h14.8a1.2 1.2 0 0 0 .7-2.2L12 10.6Z" />
      </g>
    </>
  ),
  guardada: (
    <>
      <path d="M4.5 10.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8.5" />
      <g className="mv-tapa">
        <path d="M3.5 7h17v3.5h-17z" />
      </g>
      <path className="mv-flecha" d="M12 17.6v-5M9.8 14.6 12 12.4l2.2 2.2" />
    </>
  ),
  llegada: (
    <g className="mv-paquete">
      <path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z" />
      <path d="M4 8.2 12 12.5l8-4.3M12 12.5V21" />
    </g>
  ),
  traslado: (
    <>
      <g className="mv-camion">
        <path d="M2.8 6.6h10.7v9.7H2.8z" />
        <path d="M13.5 9.8h4l3.2 3.4v3.1h-7.2" />
        <circle cx="7" cy="17.7" r="1.8" />
        <circle cx="17" cy="17.7" r="1.8" />
      </g>
      <path className="mv-rayas" d="M1.6 9.5h-.4M2.2 12.4h-1" />
    </>
  ),
  devolucion: (
    <>
      <path className="mv-giro" d="M9.5 4.5 4.5 9l5 4.5" />
      <path className="mv-giro" d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  cambio: (
    <>
      <path className="mv-a1" d="M4 8.5h14l-3.2-3.2" />
      <path className="mv-a2" d="M20 15.5H6l3.2 3.2" />
    </>
  ),
  ajuste: (
    <>
      <path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9" />
      <circle className="mv-k1" cx="15" cy="7.5" r="2" />
      <circle className="mv-k2" cx="9" cy="16.5" r="2" />
    </>
  ),
  conteo: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9.2 4.5V3.5h5.6v1" />
      <path className="mv-visto" d="M9 13l2.2 2.2 3.8-4.4" />
    </>
  ),
  apartado: (
    <g className="mv-marca">
      <path d="M7 4h10v17l-5-4-5 4V4Z" />
    </g>
  ),
  danada: (
    <g className="mv-alerta">
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </g>
  ),
  movida: (
    <>
      <path className="mv-flecha-a" d="M8 20V6M5 9l3-3 3 3" />
      <path className="mv-flecha-b" d="M16 4v14M13 15l3 3 3-3" />
    </>
  ),
  otro: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={2.6} />,
};

/** El sello de un tipo. Para que su movimiento corra otra vez, quien lo usa lo vuelve a dibujar con otra `key` (`useRepetirAlPasar`). */
export function SelloTipo({ tipo, tamano = 44 }: { tipo: TipoVisual; tamano?: number }) {
  const info = TIPOS_VISUALES[tipo];
  const ref = useRef<HTMLSpanElement>(null);
  useAlVerse(ref);
  return (
    <span ref={ref} aria-hidden className="mv-sello" data-mv-tono={info.tono} data-punteado={info.punteado ? "" : undefined} style={{ "--mv-sz": `${tamano}px` } as CSSProperties}>
      <svg viewBox="0 0 24 24" focusable="false">
        {GLIFOS[tipo]}
      </svg>
    </span>
  );
}

/** Para repetir el movimiento del sello al pasar el mouse (o el foco) por su fila: se pasa `vuelta` como `key` del sello.
 *  No repite si ya corrió hace menos de un segundo y medio, para que un mouse que se mueve dentro de la fila no lo agite. */
export function useRepetirAlPasar() {
  const [vuelta, setVuelta] = useState(0);
  const ultima = useRef(0);
  const repetir = useCallback(() => {
    const ahora = Date.now();
    if (ahora - ultima.current < 1500) return;
    ultima.current = ahora;
    setVuelta((v) => v + 1);
  }, []);
  return { vuelta, props: { onMouseEnter: repetir, onFocus: repetir } };
}
