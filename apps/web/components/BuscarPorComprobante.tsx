"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Buscar una venta por su boleta o factura (2026-09-15) — Devoluciones y Cambios solo
 * mostraban las últimas 30 de la sede; una venta más vieja no tenía cómo encontrarse.
 * El `?q=` en la URL es la fuente de verdad (mismo patrón que Movimientos): la página
 * server component vuelve a pedir los datos con la búsqueda puesta, esta caja solo
 * escribe la URL. Admite "B001-000010", "B001-10" o solo "10" — `parsearComprobante`
 * decide qué de eso se puede leer.
 *
 * "Buscar en todas las sedes" (2026-09-17): opt-in, no default — una clienta que
 * compró en otra sede antes no aparecía acá, aunque el candado de negocio real
 * (`registrar_cambio`/`crear_devolucion`) nunca exigió que fuera de esta misma sede.
 * Solo se manda a la URL (`&todas=1`) junto con una búsqueda real: no tiene sentido
 * sin `q`, y las páginas que llaman esto lo ignoran si no hay texto que buscar.
 */
export function BuscarPorComprobante({ valorInicial, todasInicial = false }: { valorInicial: string; todasInicial?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [texto, setTexto] = useState(valorInicial);
  const [todas, setTodas] = useState(todasInicial);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) {
      router.push(pathname);
      return;
    }
    const params = new URLSearchParams({ q: limpio });
    if (todas) params.set("todas", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function limpiar() {
    setTexto("");
    router.push(pathname);
  }

  return (
    <form onSubmit={buscar} className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-tinta/20 bg-transparent px-3 focus-within:border-rojo">
          <Search className="h-4 w-4 shrink-0 text-tinta/50" aria-hidden />
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por N° de boleta o factura (ej. B001-10)"
            className="min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/40"
          />
          {texto && (
            <button type="button" onClick={limpiar} aria-label="Limpiar búsqueda" className="shrink-0 text-tinta/50 hover:text-rojo">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
        <button type="submit" className="label-cayla h-10 shrink-0 rounded-lg border border-tinta/20 px-3 text-[11px] text-tinta hover:border-rojo hover:text-rojo">
          Buscar
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-tinta/65">
        <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="h-3.5 w-3.5 accent-rojo" />
        Buscar en todas las sedes
      </label>
    </form>
  );
}
