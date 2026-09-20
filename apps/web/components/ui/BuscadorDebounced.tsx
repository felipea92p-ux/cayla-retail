"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { ALTO_CONTROL } from "@/components/ui/campos";

/**
 * Campo de búsqueda con espera (350 ms) que escribe en la URL — el mismo patrón que ya usaban por
 * separado Desempeño y Comparar períodos (Vista general no lo tenía: ahora vive solo en Detalle por
 * producto, ADR-0138). Espera a que la persona termine de escribir: una consulta por tecla recalcularía
 * toda la sede en cada letra.
 */
export function BuscadorDebounced({
  valorUrl,
  onBuscar,
  placeholder = "Buscar producto, SKU, código de barras, color, talla o palabra clave — ej. blusa blanco L",
  className = "",
}: {
  valorUrl: string;
  onBuscar: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState(valorUrl);
  // Lo último que ESTE campo mandó a la URL, y lo último que la URL dijo: si la URL cambia por otra
  // vía (un chip, «Limpiar filtros») el campo la sigue; si cambió porque el propio campo la mandó, no
  // se le pisa lo que sigue escribiendo.
  const [enviado, setEnviado] = useState(valorUrl);
  const [enUrl, setEnUrl] = useState(valorUrl);
  if (valorUrl !== enUrl) {
    setEnUrl(valorUrl);
    if (valorUrl !== enviado) setQ(valorUrl);
  }

  useEffect(() => {
    if (q.trim() === valorUrl.trim()) return;
    const espera = setTimeout(() => {
      const nuevo = q.trim() ? q : "";
      setEnviado(nuevo);
      onBuscar(nuevo);
    }, 350);
    return () => clearTimeout(espera);
  }, [q, valorUrl, onBuscar]);

  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta/45" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={120}
        placeholder={placeholder}
        className={`${ALTO_CONTROL} w-full truncate rounded-md border border-tinta/15 bg-papel pl-9 pr-8 text-sm text-tinta outline-none placeholder:text-[13px] placeholder:text-tinta/45 focus:border-rojo/60`}
      />
      {q && (
        <button type="button" aria-label="Borrar la búsqueda" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-tinta/50 hover:text-tinta">
          <X aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
}
