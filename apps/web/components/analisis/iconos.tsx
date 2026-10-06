// Análisis v4 (ADR-0356): los íconos de la maqueta aprobada, trazo de 1,7 y `currentColor` (toman el color de su estado).
// La prenda sin foto NO va aquí: es `MosaicoPrenda` (ADR-0333), vía `TilePrenda` en `piezas.tsx`.

import type { ReactNode } from "react";

const TRAZOS = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  urg: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4M12 16.8v.1" />
    </>
  ),
  ate: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  nd: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.3M12 16.8v.1" />
    </>
  ),
  flechas: <path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5" />,
  tijera: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8 8.5L20 18M8 15.5L20 6" />
    </>
  ),
  caja: (
    <>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </>
  ),
  camion: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3.5 12V4.5H11l9.5 9.5-7.5 7.5z" />
      <circle cx="7.8" cy="8.8" r="1.3" />
    </>
  ),
  vigila: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  lupa: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  sigue: <path d="M5 12h14M13 6l6 6-6 6" />,
  piso: <path d="M4 20h16M7 20V9l5-4 5 4v11M10 13h4" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  llega: (
    <>
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M12 8.5v7M9 12.5l3 3 3-3" />
    </>
  ),
  agotado: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18L18 6" />
    </>
  ),
  percha: <path d="M12 8.2a2.2 2.2 0 112.2-2.2M12 8.2v1.4L3 16.6h18L12 9.6" />,
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof TRAZOS;

/** Un ícono de Análisis. Sin tamaño propio: lo pone el CSS de donde vive (`.chip svg`, `.hecho svg`…). */
export function Icono({ nombre, className }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {TRAZOS[nombre]}
    </svg>
  );
}

/** El trazo de la percha suelto, para dibujarla dentro de otro `<svg>` (las 10 perchas de «¿Se vende lo que llega?»). */
export const TRAZO_PERCHA = TRAZOS.percha;
