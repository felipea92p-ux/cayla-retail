"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";

// El buscador de Ventas ▸ Reportes ▸ Ranking de prendas: busca un modelo por su nombre o su código MIENTRAS se escribe (ADR-0358, «Buscadores»),
// con la misma pausa corta y el mismo `replace` que el del Historial: «atrás» no recorre letra por letra y el loader no se abre por lo tipeado.
// Vive en la URL (`?q=`) como los demás filtros; cambiar la búsqueda vuelve a la primera página.
const PAUSA_MS = 400;

export function BuscadorRanking({ valor }: { valor: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(valor);
  const ultimoEnviado = useRef(valor);
  const { buscando, buscar } = useBusquedaEnUrl();

  // Si la URL cambia desde afuera («Limpiar todo», «atrás»), el campo la sigue.
  useEffect(() => {
    if (valor !== ultimoEnviado.current) {
      ultimoEnviado.current = valor;
      setTexto(valor);
    }
  }, [valor]);

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === ultimoEnviado.current) return;
    const t = window.setTimeout(() => {
      ultimoEnviado.current = limpio;
      const p = new URLSearchParams(params.toString());
      if (limpio) p.set("q", limpio);
      else p.delete("q");
      p.delete("pag");
      const qs = p.toString();
      buscar(qs ? `${pathname}?${qs}` : pathname, { reemplazar: true });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, params, pathname, buscar]);

  return <Buscador valor={texto} onCambio={setTexto} buscando={buscando} atajo enterKeyHint="search" placeholder="Modelo o código" maxLength={80} title="Busca un modelo por su nombre o su código" etiqueta="Buscar en el ranking" className="min-w-[14rem] max-w-md flex-1" />; // sugerir-fijo: dice qué se puede buscar (nombre o código), no da un ejemplo de un valor
}
