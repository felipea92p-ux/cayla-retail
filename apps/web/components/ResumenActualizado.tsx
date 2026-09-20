"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { horaLima } from "@/lib/resumen-periodo";

// «Actualizado 10:21 ⓘ» (2026-09-19): lo que antes era un bloque técnico de tres líneas
// («stock usado para decisiones», «demanda analizada», fechas de cálculo) compitiendo con las
// cifras. Ahora es una sola marca discreta; el detalle —fecha del cálculo, período de demanda,
// criterio de cobertura— vive en el popover, a un clic, para quien lo quiera. Cierra con Esc o
// al hacer clic fuera.

export function ResumenActualizado({ ahoraIso, children }: { ahoraIso: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-1 rounded-sm text-[11px] text-tinta/60 transition-colors hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/40"
      >
        Actualizado {horaLima(new Date(ahoraIso))}
        <Info aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
        <span className="sr-only">: cómo se calcula</span>
      </button>
      {abierto && (
        <div id={id} role="dialog" aria-label="Cómo se calcula este resumen" className="absolute right-0 top-full z-30 mt-2 w-[min(25rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-tinta/15 bg-papel p-4 text-xs leading-[1.5] text-tinta/75 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

/** Un párrafo del popover: negrita corta + explicación. */
export function ItemAyuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-medium text-tinta">{titulo}. </span>
      {children}
    </p>
  );
}
