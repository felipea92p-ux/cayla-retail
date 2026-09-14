"use client";

import { useEffect, useRef, useState } from "react";

// Botón de ayuda "(!)" — se toca y explica un concepto en lenguaje CAYLA, sin
// tecnicismos (protocolo de docencia: dejar a Felipe más capaz de discutir, no de
// aplaudir). Estilo de marca: sutil en tinta, se enciende en rojo al pasar/abrir.
// Cero librerías, cierra al tocar afuera o con Escape.
//
// `tono="falta"` (ticket de Vender, 2026-09-14): el mismo (!) y el mismo globo, pero
// ya encendido en rojo porque falta algo de verdad — quien lo pinta decide CUÁNDO
// mostrarlo, y el globo dice QUÉ falta. El default deja el resto de las pantallas
// exactamente como estaban.
export function Ayuda({
  titulo,
  tono = "ayuda",
  children,
}: {
  titulo?: string;
  tono?: "ayuda" | "falta";
  children: React.ReactNode;
}) {
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
        aria-label={tono === "falta" ? `Falta: ${titulo ?? "algo por completar"}` : titulo ? `Qué es ${titulo}` : "Más información"}
        // h-5 y no h-4: con la etiqueta ya en 11px, el "!" se desbordaba de un
        // círculo de 16px. `active:scale-90` da el acuse de tacto que faltaba.
        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition-all active:scale-90 ${
          abierto
            ? "border-rojo bg-rojo text-crema"
            : tono === "falta"
              ? "border-rojo bg-rojo/8 text-rojo hover:bg-rojo hover:text-crema"
              : "border-tinta/30 text-tinta/65 hover:border-rojo hover:bg-rojo/8 hover:text-rojo"
        }`}
      >
        !
      </button>
      {abierto && (
        // normal-case + tracking-normal + font-sans: la explicación no debe heredar las
        // versalitas ni el tracking de una etiqueta `label-cayla` que la contenga.
        <span className="anim-globo absolute left-0 top-7 z-40 block w-64 rounded-lg border border-sand bg-papel p-3.5 text-left font-sans normal-case tracking-normal shadow-md sm:w-72">
          {titulo && <span className="label-cayla mb-1 block text-[11px] text-rojo">{titulo}</span>}
          <span className="block text-xs font-normal leading-relaxed text-tinta/80 normal-case tracking-normal">{children}</span>
        </span>
      )}
    </span>
  );
}
