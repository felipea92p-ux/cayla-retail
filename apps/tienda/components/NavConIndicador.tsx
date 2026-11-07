"use client";

import { useRef, type ReactNode } from "react";
import { useIndicador } from "./useIndicador";

/**
 * Una fila de opciones de filtro con UNA raya que se desliza hasta la elegida (`useIndicador`). Promete que sus hijos siguen siendo los enlaces de
 * siempre (la raya solo se suma, aria-hidden) y que, sin JavaScript, cada opción dibuja su propia raya. Asume que sus hijos directos son las opciones y que
 * la elegida lleva `aria-current="true"`.
 */
export function NavConIndicador({ className, ariaLabel, children }: { className: string; ariaLabel: string; children: ReactNode }) {
  const grupo = useRef<HTMLElement>(null);
  useIndicador(grupo);
  return (
    <nav ref={grupo} className={className} aria-label={ariaLabel}>
      {children}
      <span className="t-indicador" aria-hidden="true" />
    </nav>
  );
}
