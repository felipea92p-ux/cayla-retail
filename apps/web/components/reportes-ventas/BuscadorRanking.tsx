"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useBuscarAlEscribir } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";

// El buscador de Ventas ▸ Reportes ▸ Ranking de prendas: busca un modelo por su nombre o su código MIENTRAS se escribe (ADR-0358, «Buscadores»),
// con la misma pausa corta y el mismo `replace` que el del Historial: «atrás» no recorre letra por letra y el loader no se abre por lo tipeado.
// Vive en la URL (`?q=`) como los demás filtros; cambiar la búsqueda vuelve a la primera página.
export function BuscadorRanking({ valor }: { valor: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { texto, setTexto, buscando } = useBuscarAlEscribir(valor, (termino) => {
    const p = new URLSearchParams(params.toString());
    if (termino) p.set("q", termino);
    else p.delete("q");
    p.delete("pag");
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  });

  return <div data-guia="ranking.buscador" className="min-w-[14rem] max-w-md flex-1"><Buscador valor={texto} onCambio={setTexto} buscando={buscando} atajo enterKeyHint="search" placeholder="Modelo o código" maxLength={80} title="Busca un modelo por su nombre o su código" etiqueta="Buscar en el ranking" className="w-full" /></div>; // sugerir-fijo: dice qué se puede buscar (nombre o código), no da un ejemplo de un valor
}
