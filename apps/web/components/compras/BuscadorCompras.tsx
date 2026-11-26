"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useBuscarAlEscribir } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";

// El buscador de Todas las compras (ADR-0704): un solo campo para encontrar una compra por su proveedor (o su RUC), por quien la hizo o por
// su número. Vive en la URL (`?q=`), con la pausa única de `useBuscarAlEscribir`; el mes y la persona elegidos se conservan.

const MAX_LARGO = 60;

export function BuscadorCompras({ valor }: { valor: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { texto, setTexto, buscando } = useBuscarAlEscribir(
    valor,
    (termino) => {
      const p = new URLSearchParams(params.toString());
      if (termino) p.set("q", termino);
      else p.delete("q");
      const qs = p.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    { largoMaximo: MAX_LARGO },
  );
  return (
    <Buscador
      valor={texto}
      onCambio={setTexto}
      buscando={buscando}
      atajo
      enterKeyHint="search"
      etiqueta="Buscar una compra"
      placeholder="Proveedor, persona o número" // sugerir-fijo: dice qué se busca, no depende de nada elegido antes
      maxLength={MAX_LARGO}
      guia="todas.buscar"
    />
  );
}
