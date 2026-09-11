"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Botón de ayuda "(!)" — se toca y explica un concepto en lenguaje CAYLA, sin
// tecnicismos (protocolo de docencia: dejar a Felipe más capaz de discutir, no de
// aplaudir). Estilo de marca: sutil en tinta, se enciende en rojo al pasar/abrir.
//
// Sobre Popover de Radix en vez de la versión a mano de antes: el panel se
// posicionaba siempre `absolute left-0 top-7`, así que en una pantalla angosta
// o cerca del borde derecho se salía del viewport sin que nadie lo notara.
// Radix trae colisión/flip gratis, y de paso conecta `aria-expanded`/
// `aria-controls` que el `span` + `useState` de antes no tenía.
export function Ayuda({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={titulo ? `Qué es ${titulo}` : "Más información"}
          // h-5 y no h-4: con la etiqueta ya en 11px, el "!" se desbordaba de un
          // círculo de 16px. `active:scale-90` da el acuse de tacto que faltaba.
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition-all active:scale-90 ${
            abierto ? "border-rojo bg-rojo text-crema" : "border-tinta/30 text-tinta/65 hover:border-rojo hover:bg-rojo/8 hover:text-rojo"
          }`}
        >
          !
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // normal-case + tracking-normal + font-sans: la explicación no debe heredar las
        // versalitas ni el tracking de una etiqueta `label-cayla` que la contenga.
        className="anim-globo w-64 rounded-lg border-sand bg-papel p-3.5 text-left font-sans normal-case tracking-normal shadow-md sm:w-72"
      >
        {titulo && <span className="label-cayla mb-1 block text-[11px] text-rojo">{titulo}</span>}
        <span className="block text-xs font-normal leading-relaxed text-tinta/80 normal-case tracking-normal">{children}</span>
      </PopoverContent>
    </Popover>
  );
}
