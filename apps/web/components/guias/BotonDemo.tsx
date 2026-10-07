"use client";

import { PlayCircle } from "lucide-react";

// «Demo» en la cabecera de una TERMINAL (ADR-0362, Felipe 2026-10-07): un aparato de tienda no tiene «Mi perfil», que es donde
// una persona repite las guías. Va en el lugar de «Actividad» (que una terminal nunca ve) y con su misma forma, y abre el mismo
// selector que el perfil (`ElegirDemoModal`).
export function BotonDemo({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Demo: ver cómo funciona una pantalla"
      title="Ver la demo de un módulo, paso a paso"
      className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-tinta/65 transition-colors hover:bg-sand/60 hover:text-rojo sm:px-2.5"
    >
      <PlayCircle className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden />
      <span className="label-cayla hidden text-[11px] sm:inline">Demo</span>
    </button>
  );
}
