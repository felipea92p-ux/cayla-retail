"use client";

import { ALFABETO } from "@/lib/marcas";

/**
 * «Ir a»: con 89 marcas ordenadas por nombre, «la que empieza con W» es una pregunta real y bajar buscándola no es opción.
 * Cada letra lleva a la página de su primera marca (la lista la destella una vez); una letra sin marcas se ve apagada, y las
 * letras de la página que estás viendo van marcadas. Es solo un atajo: nada de esto cambia qué marcas hay.
 */
export function IndiceLetras({ presentes, enEstaPagina, onLetra }: { presentes: ReadonlySet<string>; enEstaPagina: ReadonlySet<string>; onLetra: (letra: string) => void }) {
  return (
    <div role="group" aria-label="Ir a la letra" className="flex items-center gap-0.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="label-cayla mr-2 whitespace-nowrap text-[11px] text-tinta/65">Ir a</span>
      {ALFABETO.map((letra) => {
        const hay = presentes.has(letra);
        return (
          <button
            key={letra}
            type="button"
            disabled={!hay}
            aria-label={letra === "#" ? "Ir a las marcas que empiezan con un número" : `Ir a la ${letra}`}
            onClick={() => onLetra(letra)}
            className={`h-[30px] min-w-[30px] shrink-0 rounded-lg text-[12.5px] font-semibold transition-colors motion-reduce:transition-none ${
              enEstaPagina.has(letra) ? "bg-sand" : ""
            } ${hay ? "text-tinta/80 hover:bg-hueso" : "cursor-default text-tinta/30"}`}
          >
            {letra}
          </button>
        );
      })}
    </div>
  );
}
