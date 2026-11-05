"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// «Cerrar el conteo»: lleva a la pantalla donde se revisa y se cierra. Apagado dice qué falta (Felipe 2026-11-03): al pasar el mouse, y con el dedo al tocarlo, que además lleva a lo que
// falta. No usa `disabled` porque un botón así no recibe ni el mouse ni el toque, y `aria-disabled` deja que el lector de pantalla también lo encuentre.

export function BotonCerrarConteo({
  peso,
  puedeCerrar,
  motivos,
  onCerrar,
  onIrALoQueFalta,
  guia,
}: {
  peso: "primario" | "fantasma";
  puedeCerrar: boolean;
  motivos: readonly string[];
  onCerrar: () => void;
  onIrALoQueFalta: () => void;
  guia?: string;
}) {
  const [tocado, setTocado] = useState(false);
  const cuerpo = (
    <span className="inline-flex items-center gap-2">
      Cerrar el conteo
      <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
    </span>
  );
  if (puedeCerrar) {
    return (
      <Boton type="button" peso={peso} onClick={onCerrar} data-guia={guia}>
        {cuerpo}
      </Boton>
    );
  }
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip open={tocado || undefined} onOpenChange={(abierto) => !abierto && setTocado(false)}>
        <TooltipTrigger asChild>
          <Boton
            type="button"
            peso={peso}
            aria-disabled="true"
            className="rc-cierre-apagado"
            data-guia={guia}
            onClick={() => {
              setTocado(true);
              onIrALoQueFalta();
            }}
          >
            {cuerpo}
          </Boton>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="rc-cierre-globo max-w-xs rounded-xl text-sm">
          <p className="font-semibold">Para cerrar, falta:</p>
          <ul className="mt-0.5 space-y-0.5">
            {motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
