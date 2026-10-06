"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useAlVerse } from "@/components/movimientos/useAlVerse";
import type { TonoPase } from "@/lib/traslados-pases-reglas";

// El sello de un pase (ADR-0355): el ícono de lo que le toca a quien mira, en su color, con un movimiento que corre UNA vez
// cuando se ve (`data-go`, el mismo observador de Movimientos). La lupa reemplazó a la balanza: la prueba ciega no la entendió.

export type GlifoPase = "llega" | "sale" | "contando" | "revisar" | "cerrado" | "dif" | "anulado" | "pedido" | "ciega" | "escanear";

export const CAMION = (
  <g className="tp-camion-glifo">
    <path d="M2.8 6.6h10.7v9.7H2.8z" />
    <path d="M13.5 9.8h4l3.2 3.4v3.1h-7.2" />
    <circle cx="7" cy="17.7" r="1.8" />
    <circle cx="17" cy="17.7" r="1.8" />
  </g>
);
const CAJA = <path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z" />;

const GLIFOS: Record<GlifoPase, ReactNode> = {
  llega: (
    <>
      <g className="tp-camion-sello">{CAMION}</g>
      <path className="tp-rayas" d="M1.2 9.5H.2M1.6 12.4H0" />
    </>
  ),
  sale: (
    <>
      <g className="tp-camion-sello">{CAMION}</g>
      <path className="tp-rayas" d="M1.4 9.5h-3M1.8 12.4h-3.4" />
    </>
  ),
  contando: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9.2 4.5V3.5h5.6v1" />
      <path className="tp-l1" d="M8.5 10h7" />
      <path className="tp-l2" d="M8.5 13.5h7" />
      <path className="tp-l3" d="M8.5 17h4" />
    </>
  ),
  revisar: (
    <>
      <g className="tp-lente">
        <circle cx="10.5" cy="10.5" r="6.2" />
        <path d="M8 10.5h5" />
      </g>
      <path d="m15.2 15.2 4.8 4.8" />
    </>
  ),
  cerrado: (
    <>
      <g className="tp-caja">{CAJA}</g>
      <path className="tp-visto" d="M8.6 12.4l2.4 2.4 4.4-4.8" />
    </>
  ),
  dif: (
    <>
      <g className="tp-caja">{CAJA}</g>
      <path className="tp-menos" d="M9.2 12.6h5.6" />
    </>
  ),
  anulado: (
    <>
      <path className="tp-giro" d="M9.5 4.5 4.5 9l5 4.5" />
      <path className="tp-giro" d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  pedido: (
    <>
      <path d="M12 2.2v1.3" />
      <g className="tp-etiqueta">
        <path d="M12 3.5 7.5 8v11.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8L12 3.5Z" />
        <circle cx="12" cy="8.6" r="1.1" />
        <path d="M10 13.6h4M10 16.4h3" />
      </g>
    </>
  ),
  ciega: (
    <>
      <g className="tp-caja">
        {CAJA}
        <path d="M4 8.2 12 12.5l8-4.3M12 12.5V21" />
      </g>
      <path className="tp-cinta" d="M8 6.1l8 4.2" />
    </>
  ),
  escanear: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path className="tp-rayo" d="M5 12h14" />
    </>
  ),
};

export function glifoDeTono(tono: TonoPase): GlifoPase {
  return tono === "atraso" ? "llega" : tono;
}

export function SelloPase({ glifo, tono, tamano = 40 }: { glifo: GlifoPase; tono: TonoPase; tamano?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useAlVerse(ref);
  return (
    <span ref={ref} aria-hidden className="tp-sello" data-tp-tono={tono} style={{ "--tp-sz": `${tamano}px` } as CSSProperties}>
      <svg viewBox="0 0 24 24" focusable="false">
        {GLIFOS[glifo]}
      </svg>
    </span>
  );
}
