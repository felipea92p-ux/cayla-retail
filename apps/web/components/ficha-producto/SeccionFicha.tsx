"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Una sección plegable de Editar producto (maqueta B, Felipe 2026-10-02): el número (o ✓ en verde si no le falta nada), el título,
// un resumen de una línea («Camisas y Blusas · Strend · Industrias GC SAC») y la flecha. Se abre y se pliega tocando la cabecera.
//
// Plegada, lo de adentro sigue en la página (con `visibility: hidden`): ningún id ni `data-campo` desaparece. Quien lleva a un campo
// (la guía del panel derecho, el foco de un error) abre primero su sección con `abrir`, así nunca apunta a algo invisible.

export function SeccionFicha({
  id,
  numero,
  hecho,
  titulo,
  resumen,
  abierta,
  onAbierta,
  children,
  retraso = 0,
}: {
  id: string;
  numero: number;
  hecho: boolean;
  titulo: string;
  resumen: ReactNode;
  abierta: boolean;
  onAbierta: (abierta: boolean) => void;
  children: ReactNode;
  /** Entrada en cascada de la maqueta (40, 90, 140, 190 ms). */
  retraso?: number;
}) {
  return (
    <section id={id} className="taller-sec anim-revelar scroll-mt-24" data-hecho={hecho} data-abierta={abierta} style={{ animationDelay: `${retraso}ms` }}>
      <button type="button" className="taller-sec-cab" aria-expanded={abierta} aria-controls={`${id}-cuerpo`} onClick={() => onAbierta(!abierta)}>
        <span className="taller-num" aria-label={hecho ? "Completa" : `Paso ${numero}`}>
          {hecho ? "✓" : numero}
        </span>
        <span className="text-[15px] font-semibold text-tinta">{titulo}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-taupe">{resumen}</span>
        <ChevronDown aria-hidden className="taller-chev h-4 w-4" />
      </button>
      <div className="taller-sec-cuerpo" id={`${id}-cuerpo`}>
        <div>
          <div className="px-[18px] pb-5 sm:pl-14">{children}</div>
        </div>
      </div>
    </section>
  );
}
