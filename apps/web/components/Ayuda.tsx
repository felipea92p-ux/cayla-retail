"use client";

import { useEffect, useRef, useState } from "react";

// Botón de ayuda "(!)" — se toca y explica un concepto en lenguaje CAYLA, sin
// tecnicismos (protocolo de docencia: dejar a Felipe más capaz de discutir, no de
// aplaudir). Estilo de marca: sutil en tinta, se enciende en rojo al pasar/abrir.
// Cero librerías, cierra al tocar afuera o con Escape.
export function Ayuda({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", alTocarAfuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alTocarAfuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto((v) => !v); }}
        aria-label={titulo ? `Qué es ${titulo}` : "Más información"}
        className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold leading-none transition-colors ${
          abierto ? "border-rojo bg-rojo text-crema" : "border-tinta/30 text-tinta/45 hover:border-rojo hover:text-rojo"
        }`}
      >
        !
      </button>
      {abierto && (
        // normal-case + tracking-normal + font-sans: la explicación no debe heredar las
        // versalitas ni el tracking de una etiqueta `label-cayla` que la contenga.
        <span className="absolute left-0 top-6 z-40 block w-64 border border-tinta/20 bg-crema p-3 text-left font-sans normal-case tracking-normal sm:w-72">
          {titulo && <span className="label-cayla mb-1 block text-[9px] text-rojo">{titulo}</span>}
          <span className="block text-xs font-normal leading-relaxed text-tinta/80 normal-case tracking-normal">{children}</span>
        </span>
      )}
    </span>
  );
}
